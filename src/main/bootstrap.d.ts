export type BootstrapConfig = {
    drive: {
        pastaRaizId: string;
        contaEmail?: string;
    };
};
export declare function loadBootstrap(): Promise<BootstrapConfig>;
export declare function saveBootstrap(config: BootstrapConfig): Promise<void>;
