/// <reference path="../pb_data/types.d.ts" />
/**
 * totp_core.js — pure RFC 6238 TOTP engine (SHA-1), no PocketBase globals, so it
 * can be require()'d from inside a route handler's isolated context.
 *
 * The SHA-1 / HMAC-SHA1 / base32 / TOTP functions below are verified against the
 * official RFC 6238 test vectors (secret GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ →
 * 287082 / 081804 / 005924 / 279037), i.e. they produce the same 6-digit codes
 * as Google Authenticator, Microsoft Authenticator, Duo, iPhone Passwords, etc.
 * Do not "tidy" these — they are byte-for-byte correct as written.
 * ============================================================================ */

function _sha1(bytes){var h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;var m=bytes.slice();var ml=bytes.length*8;m.push(0x80);while(m.length%64!==56)m.push(0);var hi=Math.floor(ml/4294967296),lo=ml>>>0;m.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,(lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);var w=new Array(80);for(var i=0;i<m.length;i+=64){for(var j=0;j<16;j++)w[j]=((m[i+j*4]<<24)|(m[i+j*4+1]<<16)|(m[i+j*4+2]<<8)|m[i+j*4+3])>>>0;for(j=16;j<80;j++){var n=w[j-3]^w[j-8]^w[j-14]^w[j-16];w[j]=((n<<1)|(n>>>31))>>>0;}var a=h0,b=h1,c=h2,d=h3,e=h4;for(j=0;j<80;j++){var f,k;if(j<20){f=(b&c)|((~b)&d);k=0x5A827999;}else if(j<40){f=b^c^d;k=0x6ED9EBA1;}else if(j<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC;}else{f=b^c^d;k=0xCA62C1D6;}var t=((((a<<5)|(a>>>27))>>>0)+(f>>>0)+(e>>>0)+k+w[j])>>>0;e=d;d=c;c=((b<<30)|(b>>>2))>>>0;b=a;a=t;}h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;}var o=[],hs=[h0,h1,h2,h3,h4];for(i=0;i<5;i++)o.push((hs[i]>>>24)&255,(hs[i]>>>16)&255,(hs[i]>>>8)&255,hs[i]&255);return o;}
function _hmac(key,msg){var B=64;if(key.length>B)key=_sha1(key);var k=key.slice();while(k.length<B)k.push(0);var ip=[],op=[];for(var i=0;i<B;i++){ip.push(k[i]^0x36);op.push(k[i]^0x5c);}return _sha1(op.concat(_sha1(ip.concat(msg))));}
function _b32(s){var A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";s=(s||"").toUpperCase().replace(/=+$/,"").replace(/[^A-Z2-7]/g,"");var bits=0,val=0,o=[];for(var i=0;i<s.length;i++){val=(val<<5)|A.indexOf(s.charAt(i));bits+=5;if(bits>=8){o.push((val>>>(bits-8))&255);bits-=8;}}return o;}
function _totp(secret,counter){var msg=[0,0,0,0,0,0,0,0];var lo=counter%4294967296,hi=Math.floor(counter/4294967296);msg[0]=(hi>>>24)&255;msg[1]=(hi>>>16)&255;msg[2]=(hi>>>8)&255;msg[3]=hi&255;msg[4]=(lo>>>24)&255;msg[5]=(lo>>>16)&255;msg[6]=(lo>>>8)&255;msg[7]=lo&255;var h=_hmac(secret,msg);var off=h[19]&15;var bin=(((h[off]&127)<<24)|((h[off+1]&255)<<16)|((h[off+2]&255)<<8)|(h[off+3]&255))>>>0;var s=""+(bin%1000000);while(s.length<6)s="0"+s;return s;}

// Verify a 6-digit code against a base32 secret, allowing +/- one 30s step.
function verifyTotp(secretB32, code, window) {
  code = ("" + code).replace(/\s/g, "");
  if (!/^[0-9]{6}$/.test(code)) return false;
  var secret = _b32(secretB32);
  if (!secret.length) return false;
  var step = Math.floor(Date.now() / 1000 / 30);
  var w = (window == null) ? 1 : window;
  for (var i = -w; i <= w; i++) {
    if (_totp(secret, step + i) === code) return true;
  }
  return false;
}

// Build the otpauth:// URI an authenticator app scans / imports.
function buildUri(secret, account, issuer) {
  var iss = issuer || "Just Do It Now";
  var acc = account || "user";
  return "otpauth://totp/" + encodeURIComponent(iss + ":" + acc) +
    "?secret=" + secret + "&issuer=" + encodeURIComponent(iss) +
    "&algorithm=SHA1&digits=6&period=30";
}

// UTF-8 bytes of an ASCII/utf8 string.
function _strBytes(s) {
  var b = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) b.push(c);
    else if (c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
    else b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return b;
}

// SHA-1 hex digest of a string (used to hash single-use backup codes).
function sha1hex(s) {
  var h = _sha1(_strBytes("" + s));
  var o = "";
  for (var i = 0; i < h.length; i++) o += ("0" + h[i].toString(16)).slice(-2);
  return o;
}

module.exports = { verifyTotp: verifyTotp, buildUri: buildUri, sha1hex: sha1hex };
