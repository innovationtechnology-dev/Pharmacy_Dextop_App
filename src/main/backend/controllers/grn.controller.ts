import { ipcMain, IpcMainEvent } from 'electron';
import { GRNService, GRN, GRNItemInput } from '../services/grn.service';

export class GRNController {
    private grnService: GRNService;

    constructor() {
        this.grnService = new GRNService();
        this.registerHandlers();
    }

    public async initializeTables(): Promise<void> {
        await this.grnService.initializeTable();
    }

    private registerHandlers(): void {
        // Create GRN
        ipcMain.on('grn-create', async (event: IpcMainEvent, args: any[]) => {
            try {
                const grnData = args[0] as Omit<GRN, 'id' | 'createdAt' | 'totalOrdered' | 'totalReceived' | 'totalDamaged' | 'totalAccepted'> & {
                    items: GRNItemInput[];
                };
                const grnId = await this.grnService.createGRN(grnData);
                event.reply('grn-create-reply', { success: true, data: { id: grnId } });
            } catch (error) {
                console.error('Create GRN error:', error);
                event.reply('grn-create-reply', { success: false, error: String(error) });
            }
        });

        // Get GRN by ID
        ipcMain.on('grn-get-by-id', async (event: IpcMainEvent, args: any[]) => {
            try {
                const id = args[0] as number;
                const grn = await this.grnService.getGRNById(id);
                event.reply('grn-get-by-id-reply', { success: true, data: grn });
            } catch (error) {
                console.error('Get GRN by ID error:', error);
                event.reply('grn-get-by-id-reply', { success: false, error: String(error) });
            }
        });

        // Get GRN by purchase ID
        ipcMain.on('grn-get-by-purchase', async (event: IpcMainEvent, args: any[]) => {
            try {
                const purchaseId = args[0] as number;
                const grn = await this.grnService.getGRNByPurchaseId(purchaseId);
                event.reply('grn-get-by-purchase-reply', { success: true, data: grn });
            } catch (error) {
                console.error('Get GRN by purchase ID error:', error);
                event.reply('grn-get-by-purchase-reply', { success: false, error: String(error) });
            }
        });

        // Get all GRNs
        ipcMain.on('grn-get-all', async (event: IpcMainEvent, args: any[]) => {
            try {
                const grns = await this.grnService.getAllGRNs();
                event.reply('grn-get-all-reply', { success: true, data: grns });
            } catch (error) {
                console.error('Get all GRNs error:', error);
                event.reply('grn-get-all-reply', { success: false, error: String(error) });
            }
        });

        // Get GRNs by date range
        ipcMain.on('grn-get-by-date', async (event: IpcMainEvent, args: any[]) => {
            try {
                const fromDate = args[0] as string;
                const toDate = args[1] as string;
                const grns = await this.grnService.getGRNsByDateRange(fromDate, toDate);
                event.reply('grn-get-by-date-reply', { success: true, data: grns });
            } catch (error) {
                console.error('Get GRNs by date range error:', error);
                event.reply('grn-get-by-date-reply', { success: false, error: String(error) });
            }
        });

        // Check if purchase has GRN
        ipcMain.on('grn-check-purchase', async (event: IpcMainEvent, args: any[]) => {
            try {
                const purchaseId = args[0] as number;
                const hasGRN = await this.grnService.purchaseHasGRN(purchaseId);
                event.reply('grn-check-purchase-reply', { success: true, data: hasGRN });
            } catch (error) {
                console.error('Check purchase GRN error:', error);
                event.reply('grn-check-purchase-reply', { success: false, error: String(error) });
            }
        });
    }
}

export default GRNController;
