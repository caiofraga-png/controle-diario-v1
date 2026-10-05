type Config = any;
export default function ConfigurationPanel({ initial, onSave, onClose, busy }: {
    initial: Config;
    onSave: (config: Config) => Promise<void>;
    onClose: () => void;
    busy: boolean;
}): any;
export {};
