import GLib from 'gi://GLib';

/** Use the same URI parser as the GJS runtime, without accepting credentials. */
export function validEndpoint(value: string): boolean {
    if(/[\s\u0000-\u001f\u007f]/u.test(value)) return false;
    try {
        const uri=GLib.Uri.parse(value,GLib.UriFlags.NONE);
        const port=uri.get_port();
        return uri.get_scheme()?.toLowerCase()==='https' && Boolean(uri.get_host()) &&
            uri.get_userinfo()===null && uri.get_fragment()===null &&
            (port===-1 || (port>0 && port<=65535));
    } catch { return false; }
}
