import type { ProcessFetcher } from './process_fetcher'
import WinProcessFetcherImpl from './process_fetcher_impl_win'
import MacOSProcessFetcherImpl from './process_fetcher_impl_macos'

export class ProcessFetcherFactory {
  static create(): ProcessFetcher {
    console.log("currnet platform:", process.platform);
    if (process.platform === 'win32') {
      return new WinProcessFetcherImpl()
    } else if (process.platform === 'darwin') {
      return new MacOSProcessFetcherImpl()
    } else {
      throw new Error('Linux is not supprted now.')
    }
  }
}
