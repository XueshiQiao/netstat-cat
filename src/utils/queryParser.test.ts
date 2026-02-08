import { describe, it, expect } from 'vitest'
import { parseQuery, isValidQuery, NetstatItem } from './queryParser'

const mockItem: NetstatItem = {
  protocol: 'tcp',
  local: { address: '127.0.0.1', port: 8080 },
  remote: { address: '1.1.1.1', port: 443 },
  state: 'ESTABLISHED',
  pid: 1234,
  processName: 'chrome.exe'
}

const mockListen: NetstatItem = {
  protocol: 'tcp',
  local: { address: null, port: 80 },
  remote: { address: null, port: 0 },
  state: 'LISTEN',
  pid: 4,
  processName: 'System'
}

describe('Query Parser', () => {
  it('validates correct queries', () => {
    expect(isValidQuery('pid=123')).toBe(true)
    expect(isValidQuery('pid = 123')).toBe(true)
    expect(isValidQuery('process="chrome"')).toBe(true)
    expect(isValidQuery('pid=123 && state=LISTEN')).toBe(true)
    expect(isValidQuery('invalid')).toBe(false)
  })

  it('filters by PID', () => {
    const filter = parseQuery('pid=1234')
    expect(filter!(mockItem)).toBe(true)
    expect(filter!(mockListen)).toBe(false)
  })

  it('filters by Process Name', () => {
    const filter = parseQuery('process="chrome.exe"')
    expect(filter!(mockItem)).toBe(true)
    const filter2 = parseQuery('process=System') // unquoted
    expect(filter2!(mockListen)).toBe(true)
  })

  it('filters by Port (local/remote)', () => {
    expect(parseQuery('lport=8080')!(mockItem)).toBe(true)
    expect(parseQuery('lport=9999')!(mockItem)).toBe(false)
    expect(parseQuery('rport=443')!(mockItem)).toBe(true)
  })

  it('handles logical AND', () => {
    const filter = parseQuery('pid=1234 && protocol=tcp')
    expect(filter!(mockItem)).toBe(true)
    const filter2 = parseQuery('pid=1234 && protocol=udp')
    expect(filter2!(mockItem)).toBe(false)
  })

  it('handles logical OR', () => {
    const filter = parseQuery('pid=9999 || pid=1234')
    expect(filter!(mockItem)).toBe(true)
    expect(filter!(mockListen)).toBe(false)
  })

  it('handles parentheses', () => {
    const filter = parseQuery('(pid=1234 || pid=4) && state=LISTEN')
    expect(filter!(mockItem)).toBe(false) // 1234 is ESTABLISHED
    expect(filter!(mockListen)).toBe(true) // 4 is LISTEN
  })

  it('handles NOT operator', () => {
    const filter = parseQuery('!state=LISTEN')
    expect(filter!(mockItem)).toBe(true)
    expect(filter!(mockListen)).toBe(false)
  })

  it('handles comparisons > <', () => {
    expect(parseQuery('pid > 1000')!(mockItem)).toBe(true)
    expect(parseQuery('pid < 100')!(mockItem)).toBe(false)
  })

  it('handles wildcards', () => {
    expect(parseQuery('process=chrom*')!(mockItem)).toBe(true)
    expect(parseQuery('process=*exe')!(mockItem)).toBe(true)
  })

  it('handles case insensitivity', () => {
    expect(parseQuery('STATE=established')!(mockItem)).toBe(true)
  })
})
