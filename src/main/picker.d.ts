import { GoogleAuthManager } from "./googleAuth";
export declare function registerPickerIpc(auth: GoogleAuthManager): void;
export declare function openFolderPicker(): Promise<{
    id: string;
    name: string;
}>;
