import { OAuth2Client } from "google-auth-library";
export type GoogleClientConfig = {
    client_id: string;
    client_secret?: string;
};
export type AuthStatus = {
    authenticated: boolean;
    email?: string;
};
export declare class GoogleAuthManager {
    private oauth;
    getStatus(): Promise<AuthStatus>;
    getAccessToken(): Promise<string>;
    getClient(): Promise<OAuth2Client>;
    authorize(): Promise<AuthStatus>;
    disconnect(): Promise<void>;
}
