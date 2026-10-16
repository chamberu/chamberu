export interface ClockTimerOptions {
    /**
     * Keep the process alive until the timer fires (default false: engine
     * timers never hold the event loop open). Test clocks ignore it.
     */
    keepAlive?: boolean;
}

export interface Clock {
    now(): Date;
    setTimeout(fn: () => void, ms: number, opts?: ClockTimerOptions): { clear(): void };
}

export const systemClock: Clock = {
    now: () => new Date(),
    setTimeout: (fn, ms, opts) => {
        const handle = setTimeout(fn, ms);
        // never keep the process alive just for engine timers, unless asked to
        if (!opts?.keepAlive) handle.unref?.();
        return { clear: () => clearTimeout(handle) };
    },
};

interface Timer {
    at: number;
    seq: number;
    fn: () => void;
}

/**
 * Manually advanced clock for tests.
 */
export class ControllableClock implements Clock {
    protected current: number;

    protected timers: Timer[] = [];

    protected seq = 0;

    constructor(start: Date = new Date(0)) {
        this.current = start.getTime();
    }

    now(): Date {
        return new Date(this.current);
    }

    /** Clock options (keepAlive) have no meaning without a real event loop and are ignored. */
    setTimeout(fn: () => void, ms: number): { clear(): void } {
        const timer: Timer = {
            at: this.current + ms, 
            seq: this.seq++, 
            fn, 
        };
        this.timers.push(timer);
        return {
            clear: () => {
                this.timers = this.timers.filter((t) => t !== timer);
            },
        };
    }

    /**
     * Move time forward, firing due timers in order (timers scheduled by
     * fired callbacks that fall within the window fire too).
     */
    advance(ms: number): void {
        const target = this.current + ms;
        for (;;) {
            const due = this.timers
                .filter((t) => t.at <= target)
                .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!due) break;
            this.timers = this.timers.filter((t) => t !== due);
            this.current = Math.max(this.current, due.at);
            due.fn();
        }
        this.current = target;
    }
}
