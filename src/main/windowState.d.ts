type WindowState = {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
};
export declare function loadWindowState(): Promise<WindowState>;
export declare function saveWindowState(state: WindowState): Promise<void>;
export {};
