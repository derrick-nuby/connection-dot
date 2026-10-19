export type State = 'checking' | 'connected' | 'poor' | 'offline' | 'portal';
export type Network = 'unknown' | 'full' | 'limited' | 'none' | 'portal';
export interface Result { ok: boolean; ms: number; reason: string }
export class Classifier {
    private samples: boolean[] = [];
    private fast = 0;
    private slow = 0;
    private failed = 0;
    state: State = 'checking';
    reset() { this.samples = []; this.fast = this.slow = this.failed = 0; this.state = 'checking'; }
    update(results: Result[], network: Network, threshold: number): State {
        if (network === 'none' || network === 'portal') {
            this.reset(); return this.state = network === 'none' ? 'offline' : 'portal';
        }
        const successes = results.filter(r => r.ok);
        const good = successes.length > 0;
        this.samples.push(good); this.samples = this.samples.slice(-5);
        if (good) {
            this.failed = 0;
            if (Math.min(...successes.map(r => r.ms)) < threshold) {
                this.fast++; this.slow = 0;
                if (this.fast >= 2) this.state = 'connected';
            } else {
                this.fast = 0; this.slow++;
                if (this.slow >= 2) this.state = 'poor';
            }
        } else {
            this.fast = this.slow = 0; this.failed++;
            this.state = this.failed >= 3 ? (network === 'limited' ? 'offline' : 'checking') : 'poor';
        }
        return this.state;
    }
}
