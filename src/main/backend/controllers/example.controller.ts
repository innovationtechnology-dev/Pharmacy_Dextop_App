import { ipcMain, IpcMainEvent } from 'electron';

export class ExampleController {
  constructor() {
    this.registerHandlers();
  }

  /**
   * Register example IPC handlers
   */
  private registerHandlers(): void {
    // Example IPC handler
    ipcMain.on('ipc-example', async (event: IpcMainEvent, arg: any) => {
      const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
      console.log(msgTemplate(arg));
      event.reply('ipc-example', msgTemplate('pong'));
    });
  }
}

export default ExampleController;
