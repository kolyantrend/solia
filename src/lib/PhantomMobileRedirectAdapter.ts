import {
    BaseMessageSignerWalletAdapter,
    WalletName,
    WalletReadyState,
} from '@solana/wallet-adapter-base';
import { PublicKey, Transaction, TransactionVersion, VersionedTransaction } from '@solana/web3.js';

export const PhantomWalletName = 'Phantom' as WalletName<'Phantom'>;

export class PhantomMobileRedirectAdapter extends BaseMessageSignerWalletAdapter {
    name = PhantomWalletName;
    url = 'https://phantom.app';
    icon = 'https://phantom.app/favicon.ico'; // default phantom icon
    supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

    private _connecting: boolean;
    private _wallet: any | null;
    private _publicKey: PublicKey | null;
    private _readyState: WalletReadyState;

    constructor() {
        super();
        this._connecting = false;
        this._wallet = null;
        this._publicKey = null;
        this._readyState = WalletReadyState.Installed; // Force it to show as installed
    }

    get publicKey() {
        return this._publicKey;
    }

    get connecting() {
        return this._connecting;
    }

    get readyState() {
        return this._readyState;
    }

    async connect(): Promise<void> {
        try {
            if (this.connected || this.connecting) return;
            this._connecting = true;

            // This adapter is ONLY used when we are on a mobile device but OUTSIDE the Phantom in-app browser.
            // So we simply redirect the user into the Phantom app.
            
            const currentUrl = encodeURIComponent(window.location.href);
            const refUrl = encodeURIComponent(window.location.origin);
            
            // The deeplink opens Phantom's in-app browser and points it to our app
            const deeplink = `https://phantom.app/ul/browse/${currentUrl}?ref=${refUrl}`;
            
            console.log('[PhantomRedirect] Redirecting to:', deeplink);
            window.location.href = deeplink;

            // The connect promise never actually resolves on this side because the page unloads,
            // but we can just throw a user-friendly error to stop the spinner if they somehow come back quickly.
            await new Promise((resolve) => setTimeout(resolve, 2000));
            throw new Error('Redirecting to Phantom app...');

        } catch (error: any) {
            this.emit('error', error);
            throw error;
        } finally {
            this._connecting = false;
        }
    }

    async disconnect(): Promise<void> {
        this._wallet = null;
        this._publicKey = null;
        this.emit('disconnect');
    }

    async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
        throw new Error('Method not implemented.');
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
        throw new Error('Method not implemented.');
    }

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
        throw new Error('Method not implemented.');
    }
}
