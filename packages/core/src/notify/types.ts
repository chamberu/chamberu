export interface Notification {
    runId: string;
    agent: string;
    title: string;
    body?: string;
}

export interface Notifier {
    notify(notification: Notification): Promise<void>;
}
