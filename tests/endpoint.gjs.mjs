import {validEndpoint} from '../dist/endpoint.js';
for(const value of ['https://example.org/path?check=1','https://[::1]:8443/check']) {
    if(!validEndpoint(value)) throw new Error(`Rejected valid endpoint: ${value}`);
}
for(const value of ['http://example.org','https://','https://user:pass@example.org','https://example.org/#secret','https://example.org:0','https://example.org:65536','https://exa mple.org','https://example.org\n','garbage']) {
    if(validEndpoint(value)) throw new Error(`Accepted invalid endpoint: ${value}`);
}
print('HTTPS endpoint validation passed (real GLib parser)');
