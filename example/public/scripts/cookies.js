function set_cookie(name, value, exp_d, path, domain, secure) {
    var cookie_string = name + "=" + encodeURI(value);

    if (exp_d)
        cookie_string += "; expires=" + exp_d.toGMTString();

    if (path)
        cookie_string += "; path=" + encodeURI(path);

    if (domain)
        cookie_string += "; domain=" + encodeURI(domain);

    if (secure)
        cookie_string += "; secure";

    document.cookie = cookie_string;
}

function delete_cookie(cookie_name) {
    document.cookie = cookie_name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

function get_cookie(cookie_name) {
    var results = document.cookie.match('(?:^|;) ?' + cookie_name + '=([^;]*)');
    return results ? decodeURI(results[1]) : null;
}