
export type NetstatItem = {
  protocol: string
  local: {
    address: string | null
    port: number
  }
  remote: {
    address: string | null
    port: number | null
  }
  state: string
  pid: number
  processName: string
}

type Token = 
  | { type: 'IDENTIFIER', value: string }
  | { type: 'NUMBER', value: number }
  | { type: 'STRING', value: string }
  | { type: 'OPERATOR', value: string } // =, !=, >, <, >=, <=, :
  | { type: 'LOGIC', value: 'AND' | 'OR' }
  | { type: 'NOT' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'EOF' }

class Lexer {
  private pos = 0
  constructor(private input: string) {}

  nextToken(): Token {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return { type: 'EOF' }

    const char = this.input[this.pos]

    if (char === '(') { this.pos++; return { type: 'LPAREN' } }
    if (char === ')') { this.pos++; return { type: 'RPAREN' } }
    if (char === '!') {
      if (this.input[this.pos + 1] === '=') {
        this.pos += 2
        return { type: 'OPERATOR', value: '!=' }
      }
      this.pos++; return { type: 'NOT' }
    }

    // Logic Operators &&, ||
    if (char === '&' && this.input[this.pos + 1] === '&') {
      this.pos += 2; return { type: 'LOGIC', value: 'AND' }
    }
    if (char === '|' && this.input[this.pos + 1] === '|') {
      this.pos += 2; return { type: 'LOGIC', value: 'OR' }
    }

    // Comparison Operators
    if (['=', '>', '<'].includes(char)) {
      let op = char
      this.pos++
      if (this.input[this.pos] === '=') {
        op += '='
        this.pos++
      }
      return { type: 'OPERATOR', value: op }
    }
    if (char === ':') { this.pos++; return { type: 'OPERATOR', value: ':' } } // Alias for =

    // Identifiers (field names) or Keywords (AND, OR) or Unquoted Values
    // Starts with letter or * or _
    if (/[a-zA-Z_*]/.test(char)) {
      let start = this.pos
      while (this.pos < this.input.length && /[a-zA-Z0-9_*\-\.]/.test(this.input[this.pos])) {
        this.pos++
      }
      const text = this.input.substring(start, this.pos)
      if (text.toUpperCase() === 'AND') return { type: 'LOGIC', value: 'AND' }
      if (text.toUpperCase() === 'OR') return { type: 'LOGIC', value: 'OR' }
      return { type: 'IDENTIFIER', value: text } // Keep case for values, lowercase field names in parser if needed
    }

    // Numbers (or Strings starting with number like 123*)
    if (/[0-9]/.test(char)) {
      let start = this.pos
      let isNumber = true
      while (this.pos < this.input.length && /[a-zA-Z0-9_*\-\.]/.test(this.input[this.pos])) {
        if (!/[0-9]/.test(this.input[this.pos])) isNumber = false
        this.pos++
      }
      const val = this.input.substring(start, this.pos)
      if (isNumber) {
        return { type: 'NUMBER', value: parseInt(val) }
      } else {
        return { type: 'IDENTIFIER', value: val } // Treat as string value
      }
    }

    // Quoted Strings
    if (char === '"' || char === "'") {
      const quote = char
      this.pos++
      let start = this.pos
      while (this.pos < this.input.length && this.input[this.pos] !== quote) {
        this.pos++
      }
      const val = this.input.substring(start, this.pos)
      this.pos++ // Skip closing quote
      return { type: 'STRING', value: val }
    }

    // Unknown char, skip
    this.pos++
    return this.nextToken()
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++
    }
  }
}

// --- AST ---

interface ASTNode {
  evaluate(item: NetstatItem): boolean
}

class BinaryOpNode implements ASTNode {
  constructor(
    private left: ASTNode,
    private op: 'AND' | 'OR',
    private right: ASTNode
  ) {}
  evaluate(item: NetstatItem): boolean {
    if (this.op === 'AND') return this.left.evaluate(item) && this.right.evaluate(item)
    return this.left.evaluate(item) || this.right.evaluate(item)
  }
}

class NotNode implements ASTNode {
  constructor(private child: ASTNode) {}
  evaluate(item: NetstatItem): boolean {
    return !this.child.evaluate(item)
  }
}

class ComparisonNode implements ASTNode {
  constructor(
    private field: string,
    private op: string,
    private value: string | number
  ) {}

  evaluate(item: NetstatItem): boolean {
    let actualValue: string | number | null = null

    switch (this.field) {
      case 'pid': actualValue = item.pid; break
      case 'proto': case 'protocol': actualValue = item.protocol; break
      case 'state': actualValue = item.state; break
      case 'process': case 'name': case 'processname': actualValue = item.processName; break
      case 'lport': case 'localport': actualValue = item.local.port; break
      case 'rport': case 'remoteport': actualValue = item.remote.port; break
      case 'laddr': case 'localaddress': case 'local': actualValue = item.local.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0'); break
      case 'raddr': case 'remoteaddress': case 'remote': actualValue = item.remote.address || (item.protocol.includes('6') ? '[::]' : '0.0.0.0'); break
      default: return false // Unknown field
    }

    if (actualValue === null) return false // Field might be missing (e.g. remote port on listen)

    // Normalize for comparison
    let compareVal = this.value
    let actualVal = actualValue

    // Case insensitive string comparison
    if (typeof compareVal === 'string') {
        compareVal = compareVal.toLowerCase()
        actualVal = String(actualVal).toLowerCase()
    }

    switch (this.op) {
      case '=': case ':': 
        if (typeof compareVal === 'string' && compareVal.includes('*')) {
            // Wildcard match
            const regex = new RegExp('^' + compareVal.replace(/\*/g, '.*') + '$')
            return regex.test(String(actualVal))
        }
        return actualVal == compareVal
      case '!=': return actualVal != compareVal
      case '>': return actualVal > compareVal
      case '<': return actualVal < compareVal
      case '>=': return actualVal >= compareVal
      case '<=': return actualVal <= compareVal
      default: return false
    }
  }
}

class Parser {
  private currentToken: Token
  private lexer: Lexer

  constructor(input: string) {
    this.lexer = new Lexer(input)
    this.currentToken = this.lexer.nextToken()
  }

  parse(): ASTNode {
    return this.parseExpression()
  }

  private eat(type: Token['type']) {
    if (this.currentToken.type === type) {
      this.currentToken = this.lexer.nextToken()
    } else {
      throw new Error(`Unexpected token: ${JSON.stringify(this.currentToken)}, expected ${type}`)
    }
  }

  // Expression -> OrTerm { OR OrTerm }
  private parseExpression(): ASTNode {
    let node = this.parseAndTerm()

    while (this.currentToken.type === 'LOGIC' && this.currentToken.value === 'OR') {
      this.eat('LOGIC')
      node = new BinaryOpNode(node, 'OR', this.parseAndTerm())
    }
    return node
  }

  // AndTerm -> Factor { AND Factor }
  private parseAndTerm(): ASTNode {
    let node = this.parseFactor()

    while (this.currentToken.type === 'LOGIC' && this.currentToken.value === 'AND') {
      this.eat('LOGIC')
      node = new BinaryOpNode(node, 'AND', this.parseFactor())
    }
    return node
  }

  // Factor -> ( Expression ) | NOT Factor | Comparison
  private parseFactor(): ASTNode {
    if (this.currentToken.type === 'LPAREN') {
      this.eat('LPAREN')
      const node = this.parseExpression()
      this.eat('RPAREN')
      return node
    }
    if (this.currentToken.type === 'NOT') {
      this.eat('NOT')
      return new NotNode(this.parseFactor())
    }

    return this.parseComparison()
  }

  // Comparison -> Identifier Operator Value
  private parseComparison(): ASTNode {
    if (this.currentToken.type !== 'IDENTIFIER') {
       throw new Error(`Expected identifier, got ${this.currentToken.type}`)
    }
    const field = this.currentToken.value.toLowerCase()
    this.eat('IDENTIFIER')

    if (this.currentToken.type !== 'OPERATOR') {
        throw new Error(`Expected operator, got ${this.currentToken.type}`)
    }
    const op = this.currentToken.value
    this.eat('OPERATOR')

    let val: string | number
    if (this.currentToken.type === 'NUMBER') {
        val = this.currentToken.value
        this.eat('NUMBER')
    } else if (this.currentToken.type === 'STRING') {
        val = this.currentToken.value
        this.eat('STRING')
    } else if (this.currentToken.type === 'IDENTIFIER') {
        // Allow unquoted strings as values
        val = this.currentToken.value
        this.eat('IDENTIFIER')
    } else {
        throw new Error(`Expected value, got ${this.currentToken.type}`)
    }

    return new ComparisonNode(field, op, val)
  }
}

export function parseQuery(query: string): ((item: NetstatItem) => boolean) | null {
  try {
    const parser = new Parser(query)
    const ast = parser.parse()
    return (item) => ast.evaluate(item)
  } catch (e) {
    // console.error('Parse error:', e)
    return null
  }
}

export function isValidQuery(query: string): boolean {
    if (!query.trim()) return false
    try {
        const parser = new Parser(query)
        parser.parse()
        return true
    } catch {
        return false
    }
}
