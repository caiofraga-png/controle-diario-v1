import { DriveService } from "./driveService";
export declare class SessionService {
    private readonly drive;
    private readonly sessionId;
    private heartbeatTimer;
    private rootId;
    constructor(drive: DriveService);
    private read;
    private write;
    acquire(rootId: string): Promise<any>;
    private startHeartbeat;
    heartbeat(): Promise<void>;
    assertOwner(rootId: string): Promise<void>;
    stop(): void;
}
