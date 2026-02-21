import { ipcMain, IpcMainEvent } from 'electron';
import { PaymentService, Payment } from '../services/payment.service';

export class PaymentController {
    private paymentService: PaymentService;

    constructor() {
        this.paymentService = new PaymentService();
        this.registerHandlers();
    }

    public async initializeTables(): Promise<void> {
        await this.paymentService.initializeTable();
    }

    private registerHandlers(): void {
        // Add payment
        ipcMain.on('payment-add', async (event: IpcMainEvent, args: any[]) => {
            try {
                const payment = args[0] as Payment;
                const paymentId = await this.paymentService.addPayment(payment);
                event.reply('payment-add-reply', { success: true, data: { id: paymentId } });
            } catch (error) {
                console.error('Add payment error:', error);
                event.reply('payment-add-reply', { success: false, error: String(error) });
            }
        });

        // Get payments by purchase ID
        ipcMain.on('payment-get-by-purchase', async (event: IpcMainEvent, args: any[]) => {
            try {
                const purchaseId = args[0] as number;
                const payments = await this.paymentService.getPaymentsByPurchaseId(purchaseId);
                event.reply('payment-get-by-purchase-reply', { success: true, data: payments });
            } catch (error) {
                console.error('Get payments by purchase ID error:', error);
                event.reply('payment-get-by-purchase-reply', { success: false, error: String(error) });
            }
        });

        // Get payments by date range
        ipcMain.on('payment-get-by-date', async (event: IpcMainEvent, args: any[]) => {
            try {
                const fromDate = args[0] as string;
                const toDate = args[1] as string;
                const payments = await this.paymentService.getPaymentsByDateRange(fromDate, toDate);
                event.reply('payment-get-by-date-reply', { success: true, data: payments });
            } catch (error) {
                console.error('Get payments by date range error:', error);
                event.reply('payment-get-by-date-reply', { success: false, error: String(error) });
            }
        });
    }
}

export default PaymentController;
