/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
(function () {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var BlockCipher = C_lib.BlockCipher;
    var C_algo = C.algo;

    // Lookup tables
    var SBOX = [];
    var INV_SBOX = [];
    var SUB_MIX_0 = [];
    var SUB_MIX_1 = [];
    var SUB_MIX_2 = [];
    var SUB_MIX_3 = [];
    var INV_SUB_MIX_0 = [];
    var INV_SUB_MIX_1 = [];
    var INV_SUB_MIX_2 = [];
    var INV_SUB_MIX_3 = [];

    // Compute lookup tables
    (function () {
        // Compute double table
        var d = [];
        for (var i = 0; i < 256; i++) {
            if (i < 128) {
                d[i] = i << 1;
            } else {
                d[i] = (i << 1) ^ 0x11b;
            }
        }

        // Walk GF(2^8)
        var x = 0;
        var xi = 0;
        for (var i = 0; i < 256; i++) {
            // Compute sbox
            var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
            sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
            SBOX[x] = sx;
            INV_SBOX[sx] = x;

            // Compute multiplication
            var x2 = d[x];
            var x4 = d[x2];
            var x8 = d[x4];

            // Compute sub bytes, mix columns tables
            var t = (d[sx] * 0x101) ^ (sx * 0x1010100);
            SUB_MIX_0[x] = (t << 24) | (t >>> 8);
            SUB_MIX_1[x] = (t << 16) | (t >>> 16);
            SUB_MIX_2[x] = (t << 8)  | (t >>> 24);
            SUB_MIX_3[x] = t;

            // Compute inv sub bytes, inv mix columns tables
            var t = (x8 * 0x1010101) ^ (x4 * 0x10001) ^ (x2 * 0x101) ^ (x * 0x1010100);
            INV_SUB_MIX_0[sx] = (t << 24) | (t >>> 8);
            INV_SUB_MIX_1[sx] = (t << 16) | (t >>> 16);
            INV_SUB_MIX_2[sx] = (t << 8)  | (t >>> 24);
            INV_SUB_MIX_3[sx] = t;

            // Compute next counter
            if (!x) {
                x = xi = 1;
            } else {
                x = x2 ^ d[d[d[x8 ^ x2]]];
                xi ^= d[d[xi]];
            }
        }
    }());

    // Precomputed Rcon lookup
    var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

    /**
     * AES block cipher algorithm.
     */
    var AES = C_algo.AES = BlockCipher.extend({
        _doReset: function () {
            // Shortcuts
            var key = this._key;
            var keyWords = key.words;
            var keySize = key.sigBytes / 4;

            // Compute number of rounds
            var nRounds = this._nRounds = keySize + 6

            // Compute number of key schedule rows
            var ksRows = (nRounds + 1) * 4;

            // Compute key schedule
            var keySchedule = this._keySchedule = [];
            for (var ksRow = 0; ksRow < ksRows; ksRow++) {
                if (ksRow < keySize) {
                    keySchedule[ksRow] = keyWords[ksRow];
                } else {
                    var t = keySchedule[ksRow - 1];

                    if (!(ksRow % keySize)) {
                        // Rot word
                        t = (t << 8) | (t >>> 24);

                        // Sub word
                        t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) | (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff];

                        // Mix Rcon
                        t ^= RCON[(ksRow / keySize) | 0] << 24;
                    } else if (keySize > 6 && ksRow % keySize == 4) {
                        // Sub word
                        t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) | (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff];
                    }

                    keySchedule[ksRow] = keySchedule[ksRow - keySize] ^ t;
                }
            }

            // Compute inv key schedule
            var invKeySchedule = this._invKeySchedule = [];
            for (var invKsRow = 0; invKsRow < ksRows; invKsRow++) {
                var ksRow = ksRows - invKsRow;

                if (invKsRow % 4) {
                    var t = keySchedule[ksRow];
                } else {
                    var t = keySchedule[ksRow - 4];
                }

                if (invKsRow < 4 || ksRow <= 4) {
                    invKeySchedule[invKsRow] = t;
                } else {
                    invKeySchedule[invKsRow] = INV_SUB_MIX_0[SBOX[t >>> 24]] ^ INV_SUB_MIX_1[SBOX[(t >>> 16) & 0xff]] ^
                                               INV_SUB_MIX_2[SBOX[(t >>> 8) & 0xff]] ^ INV_SUB_MIX_3[SBOX[t & 0xff]];
                }
            }
        },

        encryptBlock: function (M, offset) {
            this._doCryptBlock(M, offset, this._keySchedule, SUB_MIX_0, SUB_MIX_1, SUB_MIX_2, SUB_MIX_3, SBOX);
        },

        decryptBlock: function (M, offset) {
            // Swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;

            this._doCryptBlock(M, offset, this._invKeySchedule, INV_SUB_MIX_0, INV_SUB_MIX_1, INV_SUB_MIX_2, INV_SUB_MIX_3, INV_SBOX);

            // Inv swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;
        },

        _doCryptBlock: function (M, offset, keySchedule, SUB_MIX_0, SUB_MIX_1, SUB_MIX_2, SUB_MIX_3, SBOX) {
            // Shortcut
            var nRounds = this._nRounds;

            // Get input, add round key
            var s0 = M[offset]     ^ keySchedule[0];
            var s1 = M[offset + 1] ^ keySchedule[1];
            var s2 = M[offset + 2] ^ keySchedule[2];
            var s3 = M[offset + 3] ^ keySchedule[3];

            // Key schedule row counter
            var ksRow = 4;

            // Rounds
            for (var round = 1; round < nRounds; round++) {
                // Shift rows, sub bytes, mix columns, add round key
                var t0 = SUB_MIX_0[s0 >>> 24] ^ SUB_MIX_1[(s1 >>> 16) & 0xff] ^ SUB_MIX_2[(s2 >>> 8) & 0xff] ^ SUB_MIX_3[s3 & 0xff] ^ keySchedule[ksRow++];
                var t1 = SUB_MIX_0[s1 >>> 24] ^ SUB_MIX_1[(s2 >>> 16) & 0xff] ^ SUB_MIX_2[(s3 >>> 8) & 0xff] ^ SUB_MIX_3[s0 & 0xff] ^ keySchedule[ksRow++];
                var t2 = SUB_MIX_0[s2 >>> 24] ^ SUB_MIX_1[(s3 >>> 16) & 0xff] ^ SUB_MIX_2[(s0 >>> 8) & 0xff] ^ SUB_MIX_3[s1 & 0xff] ^ keySchedule[ksRow++];
                var t3 = SUB_MIX_0[s3 >>> 24] ^ SUB_MIX_1[(s0 >>> 16) & 0xff] ^ SUB_MIX_2[(s1 >>> 8) & 0xff] ^ SUB_MIX_3[s2 & 0xff] ^ keySchedule[ksRow++];

                // Update state
                s0 = t0;
                s1 = t1;
                s2 = t2;
                s3 = t3;
            }

            // Shift rows, sub bytes, add round key
            var t0 = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 0xff] << 16) | (SBOX[(s2 >>> 8) & 0xff] << 8) | SBOX[s3 & 0xff]) ^ keySchedule[ksRow++];
            var t1 = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 0xff] << 16) | (SBOX[(s3 >>> 8) & 0xff] << 8) | SBOX[s0 & 0xff]) ^ keySchedule[ksRow++];
            var t2 = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 0xff] << 16) | (SBOX[(s0 >>> 8) & 0xff] << 8) | SBOX[s1 & 0xff]) ^ keySchedule[ksRow++];
            var t3 = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 0xff] << 16) | (SBOX[(s1 >>> 8) & 0xff] << 8) | SBOX[s2 & 0xff]) ^ keySchedule[ksRow++];

            // Set output
            M[offset]     = t0;
            M[offset + 1] = t1;
            M[offset + 2] = t2;
            M[offset + 3] = t3;
        },

        keySize: 256/32
    });

    /**
     * Shortcut functions to the cipher's object interface.
     *
     * @example
     *
     *     var ciphertext = CryptoJS.AES.encrypt(message, key, cfg);
     *     var plaintext  = CryptoJS.AES.decrypt(ciphertext, key, cfg);
     */
    C.AES = BlockCipher._createHelper(AES);
}());
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var NeoTest;
(function (NeoTest) {
    class Menu {
        constructor() {
            console.log("hello world");
        }
        start() {
            var num = "10000000";
            var bignum = new Neo.BigInteger(num);
            var uint8 = bignum.toUint8ArrayWithSign(true);
            var bignumrev = Neo.BigInteger.fromUint8ArrayAutoSign(uint8);
            console.log("bignum=" + bignum);
            console.log("bignumhex=" + uint8.toHexString());
            console.log("bignumrev=" + bignumrev);
            var bignum2 = new Neo.BigInteger("-1");
            var uint82 = bignum2.toUint8ArrayWithSign(true);
            var bignum2rev = Neo.BigInteger.fromUint8ArrayAutoSign(uint82);
            console.log("bignum2=" + bignum2);
            console.log("bignum2hex=" + uint82.toHexString());
            console.log("bignum2rev=" + bignum2rev);
            var bignum3 = new Neo.BigInteger("-129");
            var uint83 = bignum3.toUint8ArrayWithSign(true);
            var bignum3rev = Neo.BigInteger.fromUint8ArrayAutoSign(uint83);
            console.log("bignum3=" + bignum3);
            console.log("bignum3hex=" + uint83.toHexString());
            console.log("bignum3rev=" + bignum3rev);
            this.createMenu();
            this.addText("NEO-ThinSDK(typescript)");
            this.addLink("Github", "https://github.com/NewEconoLab/neo-thinsdk-ts");
            this.addText("基本签名运算Cryptography");
            this.addMenuItem(new NeoTest.Test_CheckAddress());
            this.addMenuItem(new NeoTest.Test_Hash2Address());
            this.addMenuItem(new NeoTest.Test_Pubkey2Address());
            this.addMenuItem(new NeoTest.Test_WifDecode());
            this.addMenuItem(new NeoTest.Test_Sign());
            this.addText("钱包相关Wallet");
            this.addMenuItem(new NeoTest.Test_Nep2FromPrikey());
            this.addMenuItem(new NeoTest.Test_Nep2ToPrikey());
            this.addMenuItem(new NeoTest.Test_Nep6());
            this.addMenuItem(new NeoTest.Test_Nep6Gen());
            this.addText("交易相关Transaction");
            this.addLink("WalletTest", "wallet.html");
            this.addText("交易解析TransactionAnalysis");
            this.addMenuItem(new NeoTest.Test_TransactionAnalysis());
            this.addText("合约相关Contract");
            this.addMenuItem(new NeoTest.Test_ASM2AVM());
            this.addMenuItem(new NeoTest.Test_ScriptBuilder());
            this.addMenuItem(new NeoTest.Test_GetNep5Info());
            this.addText("多签");
            this.addMenuItem(new NeoTest.Test_MultiSign());
        }
        addText(str) {
            var link = document.createElement("a");
            link.textContent = str;
            this.divMenu.appendChild(link);
            this.divMenu.appendChild(document.createElement("hr"));
        }
        addLink(str, url) {
            var link = document.createElement("a");
            link.textContent = str;
            link.href = url;
            this.divMenu.appendChild(link);
            this.divMenu.appendChild(document.createElement("hr"));
        }
        addMenuItem(item) {
            var link = document.createElement("a");
            link.textContent = item.getName();
            link.href = "#";
            this.divMenu.appendChild(link);
            link.onclick = () => {
                this.resetDiv();
                item.start(this.div);
            };
            this.divMenu.appendChild(document.createElement("hr"));
        }
        createMenu() {
            this.divMenu = document.createElement("div");
            this.divMenu.style.left = "0px";
            this.divMenu.style.width = "200px";
            this.divMenu.style.top = "0px";
            this.divMenu.style.bottom = "0px";
            this.divMenu.style.position = "absolute";
            this.divMenu.style.overflow = "hidden";
            document.body.appendChild(this.divMenu);
        }
        resetDiv() {
            if (this.div != null) {
                document.body.removeChild(this.div);
            }
            this.div = document.createElement("div");
            this.div.style.left = "200px";
            this.div.style.right = "0px";
            this.div.style.top = "0px";
            this.div.style.bottom = "0px";
            this.div.style.position = "absolute";
            this.div.style.overflow = "hidden";
            document.body.appendChild(this.div);
        }
    }
    window.onload = () => {
        var main = new Menu();
        main.start();
    };
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_CheckAddress {
        constructor() {
            console.log("hello world");
        }
        getName() {
            return "CheckAddress";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Neo address below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "ALjSnMZidJqd18iQaoCgFun6iqWRm2cVtj";
            div.appendChild(document.createElement("hr"));
            var spanDecode = document.createElement("span");
            div.appendChild(spanDecode);
            spanDecode.textContent = "decodebase58:";
            div.appendChild(document.createElement("hr"));
            var spanCheck = document.createElement("span");
            div.appendChild(spanCheck);
            spanCheck.textContent = "check:";
            div.appendChild(document.createElement("hr"));
            var spanNewAddr = document.createElement("span");
            div.appendChild(spanNewAddr);
            spanNewAddr.textContent = "newaddr:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "check";
            btn.onclick = () => {
                var array = Neo.Cryptography.Base58.decode(input.value);
                var hexstr = array.toHexString();
                var salt = array.subarray(0, 1);
                var hash = array.subarray(1, 1 + 20);
                var check = array.subarray(21, 21 + 4);
                spanDecode.textContent = "salt:" + salt.toHexString();
                spanDecode.textContent += " hash:" + hash.clone().reverse().toHexString();
                spanDecode.textContent += " check:" + check.toHexString();
                var checkdata = array.subarray(0, 21);
                var hashd = Neo.Cryptography.Sha256.computeHash(checkdata);
                hashd = Neo.Cryptography.Sha256.computeHash(hashd);
                var hashd = hashd.slice(0, 4);
                var checked = new Uint8Array(hashd);
                spanCheck.textContent = "checked:" + checked.toHexString();
                var error = false;
                for (var i = 0; i < 4; i++) {
                    if (checked[i] != check[i]) {
                        spanCheck.textContent += "[Error Addr]";
                        error = true;
                        break;
                    }
                }
                if (error) {
                    var newarray = new Uint8Array(25);
                    for (var i = 0; i < 25; i++) {
                        if (i < 21) {
                            newarray[i] = array[i];
                        }
                        else {
                            newarray[i] = checked[i - 21];
                        }
                    }
                    var newaddr = Neo.Cryptography.Base58.encode(newarray);
                    spanNewAddr.textContent = "error addr:" + newaddr;
                }
                else {
                    spanNewAddr.textContent = "right addr";
                }
            };
        }
    }
    NeoTest.Test_CheckAddress = Test_CheckAddress;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Hash2Address {
        constructor() {
        }
        getName() {
            return "Hash2Address";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a ScriptHash below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "0x0b193415c6f098b02e81a3b14d0e3b08e9c3f79a";
            div.appendChild(document.createElement("hr"));
            var spanNewAddr = document.createElement("span");
            div.appendChild(spanNewAddr);
            spanNewAddr.textContent = "newaddr:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "check";
            btn.onclick = () => {
                var array = input.value.hexToBytes().reverse();
                var address = ThinNeo.Helper.GetAddressFromScriptHash(array);
                spanNewAddr.textContent = address;
            };
        }
    }
    NeoTest.Test_Hash2Address = Test_Hash2Address;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Pubkey2Address {
        constructor() {
        }
        getName() {
            return "Test_Pubkey2Address";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a publickey below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "02bf055764de0320c8221920d856d3d9b93dfc1dcbc759a560fd42553aa025ba5c";
            div.appendChild(document.createElement("hr"));
            var spanNewAddr = document.createElement("span");
            div.appendChild(spanNewAddr);
            spanNewAddr.textContent = "newaddr:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "check";
            btn.onclick = () => {
                var array = input.value.hexToBytes();
                var address = ThinNeo.Helper.GetAddressFromPublicKey(array);
                spanNewAddr.textContent = address;
            };
        }
    }
    NeoTest.Test_Pubkey2Address = Test_Pubkey2Address;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Sign {
        constructor() {
        }
        getName() {
            return "Sign&Vertify";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Neo WIF below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.multiple = true;
            input.value = "L2CmHCqgeNHL1i9XFhTLzUXsdr5LGjag4d56YY98FqEi4j5d83Mv";
            div.appendChild(document.createElement("hr"));
            var spanDecode = document.createElement("span");
            div.appendChild(spanDecode);
            spanDecode.textContent = "private:";
            div.appendChild(document.createElement("hr"));
            var spanPubkey = document.createElement("span");
            div.appendChild(spanPubkey);
            spanPubkey.textContent = "pubkey:";
            div.appendChild(document.createElement("hr"));
            var spanAddress = document.createElement("span");
            div.appendChild(spanAddress);
            spanAddress.textContent = "address:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "use wif";
            div.appendChild(document.createElement("hr"));
            var message = document.createElement("textarea");
            div.appendChild(message);
            message.value = "010203ff1122abcd";
            message.style.width = "500px";
            message.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            var btnsign = document.createElement("button");
            div.appendChild(btnsign);
            btnsign.textContent = "sign";
            var btnvertify = document.createElement("button");
            div.appendChild(btnvertify);
            btnvertify.textContent = "vertify";
            div.appendChild(document.createElement("hr"));
            var signdata = document.createElement("textarea");
            div.appendChild(signdata);
            signdata.value = "";
            signdata.style.width = "500px";
            signdata.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            btn.onclick = () => {
                var prikey;
                var pubkey;
                var address;
                try {
                    prikey = ThinNeo.Helper.GetPrivateKeyFromWIF(input.value);
                    var hexstr = prikey.toHexString();
                    spanDecode.textContent = hexstr;
                }
                catch (e) {
                    spanDecode.textContent = e.message;
                }
                try {
                    pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(prikey);
                    var hexstr = pubkey.toHexString();
                    spanPubkey.textContent = hexstr;
                }
                catch (e) {
                    spanPubkey.textContent = e.message;
                }
                try {
                    address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                    spanAddress.textContent = address;
                }
                catch (e) {
                    spanAddress.textContent = e.message;
                }
                this.privateKey = prikey;
                this.publicKey = pubkey;
            };
            btnsign.onclick = () => {
                var str = message.value;
                var msg = str.hexToBytes();
                var sign = ThinNeo.Helper.Sign(msg, this.privateKey);
                signdata.value = sign.toHexString();
            };
            btnvertify.onclick = () => {
                var str = message.value;
                var msg = str.hexToBytes();
                var str2 = signdata.value;
                var data = str2.hexToBytes();
                var v = ThinNeo.Helper.VerifySignature(msg, data, this.publicKey);
                alert("vertify=" + v);
            };
        }
    }
    NeoTest.Test_Sign = Test_Sign;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_WifDecode {
        constructor() {
        }
        getName() {
            return "WifDecode";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Neo WIF below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "L2CmHCqgeNHL1i9XFhTLzUXsdr5LGjag4d56YY98FqEi4j5d83Mv";
            div.appendChild(document.createElement("hr"));
            var spanDecode = document.createElement("span");
            div.appendChild(spanDecode);
            spanDecode.textContent = "private:";
            div.appendChild(document.createElement("hr"));
            var spanPubkey = document.createElement("span");
            div.appendChild(spanPubkey);
            spanPubkey.textContent = "pubkey:";
            div.appendChild(document.createElement("hr"));
            var spanAddress = document.createElement("span");
            div.appendChild(spanAddress);
            spanAddress.textContent = "address:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "decode";
            btn.onclick = () => {
                var prikey;
                var pubkey;
                var address;
                try {
                    prikey = ThinNeo.Helper.GetPrivateKeyFromWIF(input.value);
                    var hexstr = prikey.toHexString();
                    spanDecode.textContent = hexstr;
                }
                catch (e) {
                    spanDecode.textContent = e.message;
                }
                try {
                    pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(prikey);
                    var hexstr = pubkey.toHexString();
                    spanPubkey.textContent = hexstr;
                }
                catch (e) {
                    spanPubkey.textContent = e.message;
                }
                try {
                    address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                    spanAddress.textContent = address;
                }
                catch (e) {
                    spanAddress.textContent = e.message;
                }
            };
        }
    }
    NeoTest.Test_WifDecode = Test_WifDecode;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Nep2FromPrikey {
        constructor() {
        }
        getName() {
            return "Prikey->Nep2";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Neo WIF below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "L2CmHCqgeNHL1i9XFhTLzUXsdr5LGjag4d56YY98FqEi4j5d83Mv";
            div.appendChild(document.createElement("hr"));
            var title1 = document.createElement("span");
            div.appendChild(title1);
            title1.textContent = "password:";
            var inputPass = document.createElement("input");
            div.appendChild(inputPass);
            inputPass.style.width = "300px";
            inputPass.style.position = "absoulte";
            inputPass.value = "";
            div.appendChild(document.createElement("hr"));
            var spanAddress = document.createElement("span");
            div.appendChild(spanAddress);
            spanAddress.textContent = "address:";
            div.appendChild(document.createElement("hr"));
            var spanNep2 = document.createElement("span");
            div.appendChild(spanNep2);
            spanNep2.textContent = "Nep2:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "Convert->NEP2";
            btn.onclick = () => {
                var prikey;
                var pubkey;
                var address;
                try {
                    prikey = ThinNeo.Helper.GetPrivateKeyFromWIF(input.value);
                    var n = 16384;
                    var r = 8;
                    var p = 8;
                    ThinNeo.Helper.GetNep2FromPrivateKey(prikey, inputPass.value, n, r, p, (info, result) => {
                        spanNep2.textContent = "info=" + info + " result=" + result;
                        console.log("result=" + "info=" + info + " result=" + result);
                    });
                    var hexstr = prikey.toHexString();
                }
                catch (e) {
                }
                try {
                    pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(prikey);
                    var hexstr = pubkey.toHexString();
                }
                catch (e) {
                }
                try {
                    address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                    spanAddress.textContent = address;
                }
                catch (e) {
                    spanAddress.textContent = e.message;
                }
            };
        }
    }
    NeoTest.Test_Nep2FromPrikey = Test_Nep2FromPrikey;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Nep2ToPrikey {
        constructor() {
        }
        getName() {
            return "Nep2->Prikey";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Nep2 below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("input");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.value = "6PYPg5zrtPBcY8YgrkLm7Zd5PprLsVKb2fxwoGukKQDrFzRjRkCZXSgkX3";
            div.appendChild(document.createElement("hr"));
            var title1 = document.createElement("span");
            div.appendChild(title1);
            title1.textContent = "password:";
            var inputPass = document.createElement("input");
            div.appendChild(inputPass);
            inputPass.style.width = "300px";
            inputPass.style.position = "absoulte";
            inputPass.value = "";
            div.appendChild(document.createElement("hr"));
            var spanAddress = document.createElement("span");
            div.appendChild(spanAddress);
            spanAddress.textContent = "address:";
            div.appendChild(document.createElement("hr"));
            var spanWif = document.createElement("span");
            div.appendChild(spanWif);
            spanWif.textContent = "wif:";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "*Convert->NEP2";
            btn.onclick = () => {
                var prikey;
                var pubkey;
                var address;
                try {
                    var nep2 = input.value;
                    var n = 16384;
                    var r = 8;
                    var p = 8;
                    ThinNeo.Helper.GetPrivateKeyFromNep2(nep2, inputPass.value, n, r, p, (info, result) => {
                        console.log("result=" + "info=" + info + " result=" + result);
                        prikey = result;
                        if (prikey != null) {
                            var pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(prikey);
                            var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                            spanAddress.textContent = address;
                            spanWif.textContent = ThinNeo.Helper.GetWifFromPrivateKey(prikey);
                        }
                        else {
                            spanWif.textContent = "result=" + "info=" + info + " result=" + result;
                        }
                    });
                }
                catch (e) {
                }
            };
        }
    }
    NeoTest.Test_Nep2ToPrikey = Test_Nep2ToPrikey;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Nep6 {
        constructor() {
        }
        getName() {
            return "Nep6 Load";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "open a nep6 file";
            div.appendChild(document.createElement("hr"));
            var file = document.createElement("input");
            div.appendChild(file);
            file.type = "file";
            var wallet;
            var reader = new FileReader();
            reader.onload = (e) => {
                var walletstr = reader.result;
                wallet = new ThinNeo.nep6wallet();
                wallet.fromJsonStr(walletstr);
                info1.textContent = "";
                for (var i = 0; i < wallet.accounts.length; i++) {
                    info1.textContent += wallet.accounts[i].address;
                    if (wallet.accounts[i].nep2key != null)
                        info1.textContent += "(have key)";
                    info1.textContent += "\r\n";
                }
            };
            file.onchange = (ev) => {
                if (file.files[0].name.includes(".json")) {
                    reader.readAsText(file.files[0]);
                }
            };
            div.appendChild(document.createElement("hr"));
            var info1 = document.createElement("textarea");
            div.appendChild(info1);
            info1.style.width = "500px";
            info1.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            var title1 = document.createElement("span");
            div.appendChild(title1);
            title1.textContent = "password:";
            var inputPass = document.createElement("input");
            div.appendChild(inputPass);
            inputPass.style.width = "300px";
            inputPass.style.position = "absoulte";
            inputPass.value = "";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "GetKeys";
            var info2 = document.createElement("textarea");
            div.appendChild(info2);
            info2.style.width = "500px";
            info2.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            btn.onclick = () => {
                try {
                    info2.textContent = "";
                    var istart = 0;
                    var getkey = null;
                    getkey = (keyindex) => {
                        if (istart < wallet.accounts.length) {
                            wallet.accounts[keyindex].getPrivateKey(wallet.scrypt, inputPass.value, (info, result) => {
                                if (info == "finish") {
                                    var pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(result);
                                    var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                                    var hexkey = result.toHexString();
                                    info2.textContent += info + "|" + address + " key=" + hexkey;
                                }
                                else {
                                    info2.textContent += info + "|" + result;
                                }
                                istart++;
                                getkey(istart);
                            });
                        }
                    };
                    getkey(0);
                }
                catch (e) {
                }
            };
        }
    }
    NeoTest.Test_Nep6 = Test_Nep6;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_Nep6Gen {
        constructor() {
        }
        getName() {
            return "Nep6 Gen";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "gen a Nep6 wallet";
            Neo.Cryptography.RandomNumberGenerator.startCollectors();
            div.appendChild(document.createElement("hr"));
            var spanPri = document.createElement("span");
            div.appendChild(spanPri);
            spanPri.textContent = "prikey";
            div.appendChild(document.createElement("hr"));
            var spanAddr = document.createElement("span");
            div.appendChild(spanAddr);
            spanAddr.textContent = "address";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "gen key";
            var key = null;
            var addr = null;
            btn.onclick = () => {
                try {
                    var array = new Uint8Array(32);
                    key = Neo.Cryptography.RandomNumberGenerator.getRandomValues(array);
                    spanPri.textContent = key.toHexString();
                    var pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(key);
                    addr = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                    spanAddr.textContent = addr;
                }
                catch (e) {
                }
            };
            div.appendChild(document.createElement("hr"));
            var span2 = document.createElement("span");
            div.appendChild(span2);
            span2.textContent = "password";
            var inputPass = document.createElement("input");
            div.appendChild(inputPass);
            inputPass.style.width = "300px";
            inputPass.style.position = "absoulte";
            inputPass.value = "";
            div.appendChild(document.createElement("hr"));
            var btnSave = document.createElement("button");
            div.appendChild(btnSave);
            btnSave.textContent = "gen wallet.json";
            var download = document.createElement("a");
            div.appendChild(download);
            download.download = "wallet.json";
            download.href = "";
            download.target = "_blank";
            download.text = "";
            btnSave.onclick = () => {
                var wallet = new ThinNeo.nep6wallet();
                wallet.scrypt = new ThinNeo.nep6ScryptParameters();
                wallet.scrypt.N = 16384;
                wallet.scrypt.r = 8;
                wallet.scrypt.p = 8;
                wallet.accounts = [];
                wallet.accounts[0] = new ThinNeo.nep6account();
                wallet.accounts[0].address = addr;
                ThinNeo.Helper.GetNep2FromPrivateKey(key, inputPass.value, wallet.scrypt.N, wallet.scrypt.r, wallet.scrypt.p, (info, result) => {
                    if (info == "finish") {
                        wallet.accounts[0].nep2key = result;
                        wallet.accounts[0].contract = new ThinNeo.contract();
                        var pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(key);
                        wallet.accounts[0].contract.script = ThinNeo.Helper.GetAddressCheckScriptFromPublicKey(pubkey).toHexString();
                        var jsonstr = JSON.stringify(wallet.toJson());
                        var blob = new Blob([ThinNeo.Helper.String2Bytes(jsonstr)]);
                        download.href = URL.createObjectURL(blob);
                        download.text = "download";
                    }
                });
            };
        }
    }
    NeoTest.Test_Nep6Gen = Test_Nep6Gen;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_TransactionAnalysis {
        constructor() {
            console.log("hello world");
        }
        getName() {
            return "TransactionAnalysis";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a Transaction Hex String below";
            div.appendChild(document.createElement("hr"));
            var input = document.createElement("textarea");
            div.appendChild(input);
            input.style.width = "500px";
            input.style.position = "absoulte";
            input.style.height = "200px";
            input.value = "d100f54030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030423032393938343036306165336165616235646364373261396330353930636535326535646132353537366161303761343761643062373861653939623564303438650a71696e676d696e677a69047465737454c10872656769737465724030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030678432d43c27d1c06eb56b9ce505910b03e4b391c10001db60f31309ff659278fa717d8259cf8f164dd2dc89a5233ca394d21965b2c9cd000001e72d286979ee6cb1b7e65dfddfb2e384100b8d148e7758de42e4168b71792c6032775ea40000000009cc8527f1a6fb18ee021595842fadd42ab74d93";
            div.appendChild(document.createElement("hr"));
            function byteToString(arr) {
                if (typeof arr === 'string') {
                    return arr;
                }
                var str = '', _arr = arr;
                for (var i = 0; i < _arr.length; i++) {
                    var one = _arr[i].toString(2), v = one.match(/^1+?(?=0)/);
                    if (v && one.length == 8) {
                        var bytesLength = v[0].length;
                        var store = _arr[i].toString(2).slice(7 - bytesLength);
                        for (var st = 1; st < bytesLength; st++) {
                            store += _arr[st + i].toString(2).slice(2);
                        }
                        str += String.fromCharCode(parseInt(store, 2));
                        i += bytesLength - 1;
                    }
                    else {
                        str += String.fromCharCode(_arr[i]);
                    }
                }
                return str;
            }
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "analysis";
            btn.onclick = () => {
                div.appendChild(document.createElement("hr"));
                var span = document.createElement("span");
                div.appendChild(span);
                span.textContent = "Transaction Type";
                span.style.color = "#000000";
                div.appendChild(document.createElement("br"));
                var span = document.createElement("span");
                div.appendChild(span);
                var txTypeId = input.value.substring(0, 2);
                switch (txTypeId) {
                    case "80":
                        span.textContent = "ContractTransaction";
                        break;
                    case "d1":
                        span.textContent = "InvocationTransaction";
                        break;
                    default:
                        span.textContent = "unknow";
                }
                span.style.color = "#FF0000";
                div.appendChild(document.createElement("br"));
                var span = document.createElement("span");
                div.appendChild(span);
                span.textContent = "Transaction Version";
                span.style.color = "#000000";
                div.appendChild(document.createElement("br"));
                var span = document.createElement("span");
                div.appendChild(span);
                span.textContent = input.value.substring(2, 4);
                span.style.color = "#00FF00";
                var tx = new ThinNeo.Transaction();
                var buf = input.value.hexToBytes();
                tx.Deserialize(new Neo.IO.BinaryReader(new Neo.IO.MemoryStream(buf.buffer, 0, buf.byteLength)));
                div.appendChild(document.createElement("hr"));
                var i = 0;
                tx.inputs.forEach(function (input) {
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = "input" + i;
                    span.style.color = "#000000";
                    div.appendChild(document.createElement("br"));
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = input.hash.reverse().toHexString();
                    span.style.color = "#FF0000";
                    div.appendChild(document.createElement("br"));
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = input.index.toString();
                    span.style.color = "#00FF00";
                    div.appendChild(document.createElement("br"));
                    i++;
                });
                div.appendChild(document.createElement("hr"));
                i = 0;
                tx.outputs.forEach(function (output) {
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = "output" + i;
                    span.style.color = "#000000";
                    div.appendChild(document.createElement("br"));
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = ThinNeo.Helper.GetAddressFromScriptHash(output.toAddress);
                    span.style.color = "#FF0000";
                    div.appendChild(document.createElement("br"));
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = output.assetId.reverse().toHexString();
                    span.style.color = "#00FF00";
                    div.appendChild(document.createElement("br"));
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = output.value.toString();
                    span.style.color = "#0000FF";
                    div.appendChild(document.createElement("br"));
                    i++;
                });
                div.appendChild(document.createElement("hr"));
                if (txTypeId == "d1") {
                    var itd = tx.extdata;
                    var span = document.createElement("span");
                    div.appendChild(span);
                    span.textContent = "script decompile";
                    span.style.color = "#000000";
                    div.appendChild(document.createElement("br"));
                    var info2 = document.createElement("textarea");
                    div.appendChild(info2);
                    info2.style.width = "500px";
                    info2.style.height = "300px";
                    try {
                        info2.textContent = "";
                        var data = itd.script;
                        var ops = ThinNeo.Compiler.Avm2Asm.Trans(data);
                        for (var i = 0; i < ops.length; i++) {
                            var op = ops[i];
                            info2.textContent += op.toString() + "\r\n";
                            try {
                                if (op.toString().substring(3, 10) == "APPCALL") {
                                    info2.textContent += "【" + op.toString().substring(13, 53).hexToBytes().reverse().toHexString() + "】" + "\r\n";
                                }
                                info2.textContent += "【" + byteToString(op.AsHexString().hexToBytes()) + "】" + "\r\n";
                            }
                            catch (_a) { }
                        }
                    }
                    catch (e) {
                    }
                    if (itd.gas != null) {
                        var span = document.createElement("span");
                        div.appendChild(span);
                        span.textContent = itd.gas.toString();
                        span.style.color = "#00FF00";
                        div.appendChild(document.createElement("br"));
                    }
                }
                for (var i = 0; i < 4; i++) {
                }
            };
        }
    }
    NeoTest.Test_TransactionAnalysis = Test_TransactionAnalysis;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_ASM2AVM {
        constructor() {
        }
        getName() {
            return "ASM2AVM";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a avm hexstr below";
            div.appendChild(document.createElement("hr"));
            var info1 = document.createElement("textarea");
            div.appendChild(info1);
            info1.style.width = "500px";
            info1.style.height = "100px";
            info1.textContent = "05006c18fb521459b637ee6d5355fd10eadd201d62840662ba2bb214520fe97e396671682f7a5f672ea0f4e719a61f5353c1087472616e7366657267f91d6b7085db7c5aaf09f19eeec1ca3c0db2c6ecf166f12c436084195f79";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "->asm code";
            div.appendChild(document.createElement("hr"));
            var info2 = document.createElement("textarea");
            div.appendChild(info2);
            info2.style.width = "500px";
            info2.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            btn.onclick = () => {
                try {
                    info2.textContent = "";
                    var data = info1.value.hexToBytes();
                    var ops = ThinNeo.Compiler.Avm2Asm.Trans(data);
                    for (var i = 0; i < ops.length; i++) {
                        var op = ops[i];
                        info2.textContent += op.toString() + "\r\n";
                    }
                }
                catch (e) {
                }
            };
        }
    }
    NeoTest.Test_ASM2AVM = Test_ASM2AVM;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_GetNep5Info {
        constructor() {
            this.nep5decimals = 0;
        }
        getName() {
            return "GetNep5Info";
        }
        makeRpcUrl(url, method, ..._params) {
            if (url[url.length - 1] != '/')
                url = url + "/";
            var urlout = url + "?jsonrpc=2.0&id=1&method=" + method + "&params=[";
            for (var i = 0; i < _params.length; i++) {
                urlout += JSON.stringify(_params[i]);
                if (i != _params.length - 1)
                    urlout += ",";
            }
            urlout += "]";
            return urlout;
        }
        makeRpcPostBody(method, ..._params) {
            var body = {};
            body["jsonrpc"] = "2.0";
            body["id"] = 1;
            body["method"] = method;
            var params = [];
            for (var i = 0; i < _params.length; i++) {
                params.push(_params[i]);
            }
            body["params"] = params;
            return body;
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a NEP5 scripthash below";
            div.appendChild(document.createElement("hr"));
            var sid = document.createElement("input");
            div.appendChild(sid);
            sid.style.width = "500px";
            sid.style.position = "absoulte";
            sid.value = "0x3fccdb91c9bb66ef2446010796feb6ca4ed96b05";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "get Info";
            var btn2 = document.createElement("button");
            div.appendChild(btn2);
            btn2.textContent = "get balance";
            var addr = document.createElement("input");
            div.appendChild(addr);
            addr.value = "ALjSnMZidJqd18iQaoCgFun6iqWRm2cVtj";
            div.appendChild(document.createElement("hr"));
            var info1 = document.createElement("textarea");
            div.appendChild(info1);
            info1.style.width = "500px";
            info1.style.height = "100px";
            info1.textContent = "";
            div.appendChild(document.createElement("hr"));
            var info2 = document.createElement("textarea");
            div.appendChild(info2);
            info2.style.width = "500px";
            info2.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            btn.onclick = () => __awaiter(this, void 0, void 0, function* () {
                try {
                    var sb = new ThinNeo.ScriptBuilder();
                    sb.EmitParamJson(JSON.parse("[]"));
                    sb.EmitParamJson("(str)name");
                    var shash = sid.value.hexToBytes();
                    sb.EmitAppCall(shash.reverse());
                    sb.EmitParamJson(JSON.parse("[]"));
                    sb.EmitParamJson("(str)symbol");
                    var shash = sid.value.hexToBytes();
                    sb.EmitAppCall(shash.reverse());
                    sb.EmitParamJson(JSON.parse("[]"));
                    sb.EmitParamJson("(str)decimals");
                    var shash = sid.value.hexToBytes();
                    sb.EmitAppCall(shash.reverse());
                    var data = sb.ToArray();
                    info1.textContent = data.toHexString();
                    var body = this.makeRpcPostBody("invokescript", data.toHexString());
                    var url = "http://47.96.168.8:20332";
                    var response = yield fetch(url, { "method": "post", "body": JSON.stringify(body) });
                    var r = yield response.json();
                    info1.textContent = JSON.stringify(r);
                    try {
                        var state = r.result.state;
                        info2.textContent = "";
                        if (state.includes("HALT")) {
                            info2.textContent += "Succ\n";
                        }
                        var stack = r.result.stack;
                        if (stack[0].type == "String")
                            info2.textContent += "name=" + stack[0].value + "\n";
                        else if (stack[0].type == "ByteArray") {
                            var bs = stack[0].value.hexToBytes();
                            var str = ThinNeo.Helper.Bytes2String(bs);
                            info2.textContent += "name=" + str + "\n";
                        }
                        if (stack[1].type == "String")
                            info2.textContent += "symbol=" + stack[1].value + "\n";
                        else if (stack[1].type == "ByteArray") {
                            var bs = stack[1].value.hexToBytes();
                            var str = ThinNeo.Helper.Bytes2String(bs);
                            info2.textContent += "symbol=" + str + "\n";
                        }
                        if (stack[2].type == "Integer") {
                            this.nep5decimals = (new Neo.BigInteger(stack[2].value)).toInt32();
                        }
                        else if (stack[2].type == "ByteArray") {
                            var bs = stack[2].value.hexToBytes();
                            var num = Neo.BigInteger.fromUint8ArrayAutoSign(bs);
                            this.nep5decimals = num.toInt32();
                        }
                        info2.textContent += "decimals=" + this.nep5decimals + "\n";
                    }
                    catch (e) {
                    }
                }
                catch (e) {
                }
            });
            btn2.onclick = () => __awaiter(this, void 0, void 0, function* () {
                var sb = new ThinNeo.ScriptBuilder();
                sb.EmitParamJson(["(addr)" + addr.value]);
                sb.EmitParamJson("(str)balanceOf");
                var shash = sid.value.hexToBytes();
                sb.EmitAppCall(shash.reverse());
                var data = sb.ToArray();
                info1.textContent = data.toHexString();
                var body = this.makeRpcPostBody("invokescript", data.toHexString());
                var url = "http://47.96.168.8:20332";
                var response = yield fetch(url, { "method": "post", "body": JSON.stringify(body) });
                var r = yield response.json();
                info1.textContent = JSON.stringify(r);
                try {
                    var state = r.result.state;
                    info2.textContent = "";
                    if (state.includes("HALT")) {
                        info2.textContent += "Succ\n";
                    }
                    var stack = r.result.stack;
                    var bnum = new Neo.BigInteger(0);
                    if (stack[0].type == "Integer") {
                        bnum = new Neo.BigInteger(stack[0].value);
                    }
                    else if (stack[0].type == "ByteArray") {
                        var bs = stack[0].value.hexToBytes();
                        bnum = Neo.BigInteger.fromUint8ArrayAutoSign(bs);
                    }
                    var v = 1;
                    for (var i = 0; i < this.nep5decimals; i++) {
                        v *= 10;
                    }
                    var intv = bnum.divide(v).toInt32();
                    var smallv = bnum.mod(v).toInt32() / v;
                    info2.textContent += "count=" + (intv + smallv);
                }
                catch (e) {
                }
            });
        }
    }
    NeoTest.Test_GetNep5Info = Test_GetNep5Info;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_ScriptBuilder {
        constructor() {
        }
        getName() {
            return "ScriptBuilder";
        }
        start(div) {
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "type a scripthash below";
            div.appendChild(document.createElement("hr"));
            var sid = document.createElement("input");
            div.appendChild(sid);
            sid.style.width = "500px";
            sid.style.position = "absoulte";
            sid.value = "0xf389ee8159f109c9579bb950fa0a4da5b1b26b70";
            div.appendChild(document.createElement("hr"));
            var infoParam = document.createElement("textarea");
            div.appendChild(infoParam);
            infoParam.style.width = "500px";
            infoParam.style.height = "100px";
            infoParam.textContent = "[\n\"(str)name\",\n[\n]\n]";
            div.appendChild(document.createElement("hr"));
            var btn = document.createElement("button");
            div.appendChild(btn);
            btn.textContent = "makeAppCall";
            div.appendChild(document.createElement("hr"));
            var info1 = document.createElement("textarea");
            div.appendChild(info1);
            info1.style.width = "500px";
            info1.style.height = "100px";
            info1.textContent = "";
            div.appendChild(document.createElement("hr"));
            var info2 = document.createElement("textarea");
            div.appendChild(info2);
            info2.style.width = "500px";
            info2.style.height = "100px";
            div.appendChild(document.createElement("hr"));
            btn.onclick = () => {
                try {
                    var ps = JSON.parse(infoParam.value);
                    var sb = new ThinNeo.ScriptBuilder();
                    for (var i = ps.length - 1; i >= 0; i--) {
                        sb.EmitParamJson(ps[i]);
                    }
                    var shash = sid.value.hexToBytes();
                    sb.EmitAppCall(shash);
                    var data = sb.ToArray();
                    info1.textContent = data.toHexString();
                    info2.textContent = "";
                    var ops = ThinNeo.Compiler.Avm2Asm.Trans(data);
                    for (var i = 0; i < ops.length; i++) {
                        var op = ops[i];
                        info2.textContent += op.toString() + "\r\n";
                    }
                }
                catch (e) {
                }
            };
        }
    }
    NeoTest.Test_ScriptBuilder = Test_ScriptBuilder;
})(NeoTest || (NeoTest = {}));
var NeoTest;
(function (NeoTest) {
    class Test_MultiSign {
        constructor() {
            this.tx = new Tx();
        }
        getName() {
            return "MultiSign";
        }
        start(div) {
            this.keys = new Array();
            this.key = new key();
            this.key.prikey = null;
            this.key.multisignkey = true;
            this.key.MKey_NeedCount = 1;
            this.key.MKey_Pubkeys = new Array();
            this.tx = new Tx();
            var span = document.createElement("span");
            div.appendChild(span);
            span.textContent = "多签工具";
            div.appendChild(document.createElement("hr"));
            var label_account = document.createElement("label");
            div.appendChild(label_account);
            label_account.textContent = "账户列表:";
            div.appendChild(document.createElement("br"));
            var text_account = document.createElement("textarea");
            div.appendChild(text_account);
            text_account.style.width = "800px";
            text_account.style.height = "100px";
            text_account.textContent = "";
            div.appendChild(document.createElement("hr"));
            var label = document.createElement("label");
            div.appendChild(label);
            label.textContent = "增加普通账户:";
            div.appendChild(document.createElement("br"));
            var lb_wif = document.createElement("label");
            div.appendChild(lb_wif);
            lb_wif.textContent = "填入wif：";
            var input_wif = document.createElement("input");
            div.appendChild(input_wif);
            input_wif.style.width = "500px";
            input_wif.style.position = "absoulte";
            input_wif.multiple = true;
            input_wif.value = "";
            var btn_addwif = document.createElement("button");
            div.appendChild(btn_addwif);
            btn_addwif.textContent = "add wif";
            div.appendChild(document.createElement("br"));
            var lb_nep6 = document.createElement("label");
            div.appendChild(lb_nep6);
            lb_nep6.textContent = "导入nep6钱包";
            var file = document.createElement("input");
            div.appendChild(file);
            file.type = "file";
            var lb_pw = document.createElement("label");
            div.appendChild(lb_pw);
            lb_pw.textContent = "密码：";
            var input_pw = document.createElement("input");
            div.appendChild(input_pw);
            input_pw.style.width = "500px";
            input_pw.style.position = "absoulte";
            input_pw.multiple = true;
            input_pw.value = "";
            var btn_sure = document.createElement("button");
            btn_sure.textContent = "确认";
            div.appendChild(btn_sure);
            div.appendChild(document.createElement("hr"));
            var label = document.createElement("label");
            div.appendChild(label);
            label.textContent = "增加多签账户:";
            div.appendChild(document.createElement("br"));
            var label = document.createElement("label");
            div.appendChild(label);
            label.textContent = "填入公钥";
            var input_pubKey = document.createElement("input");
            div.appendChild(input_pubKey);
            input_pubKey.style.width = "500px";
            input_pubKey.style.position = "absoulte";
            input_pubKey.multiple = true;
            input_pubKey.value = "";
            var btn_addPubKey = document.createElement("button");
            div.appendChild(btn_addPubKey);
            btn_addPubKey.textContent = "add pubKey";
            div.appendChild(document.createElement("br"));
            div.appendChild(document.createElement("br"));
            var text_addrs = document.createElement("textarea");
            div.appendChild(text_addrs);
            text_addrs.style.width = "800px";
            text_addrs.style.height = "100px";
            text_addrs.textContent = "";
            div.appendChild(document.createElement("br"));
            var label = document.createElement("label");
            div.appendChild(label);
            label.textContent = "最小签名数";
            var input_count = document.createElement("input");
            div.appendChild(input_count);
            input_count.style.width = "500px";
            input_count.style.position = "absoulte";
            input_count.multiple = true;
            input_count.value = "";
            var btn_ok = document.createElement("button");
            div.appendChild(btn_ok);
            btn_ok.textContent = "ok";
            div.appendChild(document.createElement("hr"));
            var text_data = document.createElement("textarea");
            div.appendChild(text_data);
            text_data.style.width = "500px";
            text_data.style.height = "200px";
            text_data.value = "";
            var btn_import = document.createElement("button");
            div.appendChild(btn_import);
            btn_import.textContent = "import data";
            div.appendChild(document.createElement("hr"));
            var text_tx = document.createElement("textarea");
            div.appendChild(text_tx);
            text_tx.style.width = "800px";
            text_tx.style.height = "200px";
            text_tx.textContent = "";
            var btn_sign = document.createElement("button");
            div.appendChild(btn_sign);
            btn_sign.textContent = "sign";
            var wallet;
            var reader = new FileReader();
            reader.onload = (e) => {
                var walletstr = reader.result;
                wallet = new ThinNeo.nep6wallet();
                wallet.fromJsonStr(walletstr);
            };
            file.onchange = (ev) => {
                if (file.files[0].name.includes(".json")) {
                    reader.readAsText(file.files[0]);
                }
            };
            btn_sure.onclick = () => {
                if (!input_pw.value) {
                    alert("请输入密码");
                    return;
                }
                var addPrikey = (num, wallet) => {
                    if (!wallet.accounts[num].nep2key) {
                        alert("nep2key wrong" + wallet.accounts[num].address);
                        return;
                    }
                    wallet.accounts[num].getPrivateKey(wallet.scrypt, input_pw.value, (info, result) => {
                        if (info == "finish") {
                            var priKey = result;
                            var _key = new key();
                            _key.MKey_NeedCount = 0;
                            _key.MKey_Pubkeys = null;
                            _key.multisignkey = false;
                            _key.prikey = priKey;
                            for (var i = 0; i < this.keys.length; i++) {
                                if (this.keys[i].ToString() == _key.ToString())
                                    return;
                            }
                            this.keys.push(_key);
                            console.log(priKey);
                            updateUI();
                            num = num + 1;
                            if (wallet.accounts.length <= num)
                                return;
                            addPrikey(num, wallet);
                        }
                        else {
                            console.log(result);
                        }
                    });
                };
                addPrikey(0, wallet);
            };
            btn_addwif.onclick = () => {
                var wif = input_wif.value;
                var priKey = ThinNeo.Helper.GetPrivateKeyFromWIF(wif);
                var _key = new key();
                _key.MKey_NeedCount = 0;
                _key.MKey_Pubkeys = null;
                _key.multisignkey = false;
                _key.prikey = priKey;
                for (var i = 0; i < this.keys.length; i++) {
                    if (this.keys[i].ToString() == _key.ToString())
                        return;
                }
                this.keys.push(_key);
                updateUI();
            };
            btn_addPubKey.onclick = () => {
                var pubKey = input_pubKey.value;
                var bytes_pubKey = pubKey.hexToBytes();
                if (bytes_pubKey.length != 33)
                    return;
                this.key.AddPubkey(bytes_pubKey);
                text_addrs.textContent = "";
                for (var i = 0; i < this.key.MKey_Pubkeys.length; i++) {
                    var pubkey = this.key.MKey_Pubkeys[i];
                    var pubkeystr = pubkey.toHexString();
                    var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                    text_addrs.textContent = text_addrs.textContent + address + "[" + pubkeystr + "]" + "\r\n";
                }
            };
            btn_ok.onclick = () => {
                this.key.MKey_NeedCount = Number.parseInt(input_count.value);
                this.keys.push(this.key);
                updateUI();
            };
            btn_import.onclick = () => {
                this.tx.FromString(this.keys, text_data.value);
                updateUI();
            };
            btn_sign.onclick = () => {
                var signcount = 0;
                var data = this.tx.txraw.GetMessage();
                for (var i = 0; i < this.keys.length; i++) {
                    var key = this.keys[i];
                    if (key.prikey == null)
                        continue;
                    var addr = key.GetAddress();
                    for (var k in this.tx.keyinfos) {
                        var type = this.tx.keyinfos[k].type;
                        if (type == KeyType.Simple) {
                            if (k == addr) {
                                this.tx.keyinfos[k].signdata[0] = ThinNeo.Helper.Sign(data, key.prikey);
                                signcount++;
                            }
                        }
                        if (type == KeyType.MultiSign) {
                            for (var ii = 0; ii < this.tx.keyinfos[k].MultiSignKey.MKey_Pubkeys.length; ii++) {
                                var pub = this.tx.keyinfos[k].MultiSignKey.MKey_Pubkeys[ii];
                                var signaddr = ThinNeo.Helper.GetAddressFromPublicKey(pub);
                                if (addr == signaddr) {
                                    this.tx.keyinfos[k].signdata[ii] = ThinNeo.Helper.Sign(data, key.prikey);
                                    signcount++;
                                }
                            }
                        }
                    }
                }
                if (signcount == 0) {
                    alert("没有找到可以签名的");
                }
                else {
                    updateTxUI();
                    updateDataUI();
                }
            };
            var updateUI = () => {
                text_account.textContent = "";
                for (var i = 0; i < this.keys.length; i++) {
                    var _key = this.keys[i];
                    text_account.textContent = text_account.textContent + _key.ToString() + "\r\n";
                    if (_key.multisignkey) {
                        for (var ii = 0; ii < _key.MKey_Pubkeys.length; ii++) {
                            var pubkey = _key.MKey_Pubkeys[ii];
                            var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                            text_account.textContent = text_account.textContent + "\t" + address + "\r\n";
                        }
                    }
                }
                try {
                    if (this.tx != null) {
                        this.tx.ImportKeyInfo(this.keys);
                    }
                    updateTxUI();
                }
                catch (_a) {
                }
            };
            var updateTxUI = () => {
                text_tx.textContent = "";
                if (this.tx == null) {
                    text_tx.textContent = "null";
                }
                else {
                    text_tx.textContent += ThinNeo.TransactionType[this.tx.txraw.type] + ":" + this.tx.txraw.GetHash().toHexString() + "\r\n";
                    for (var k in this.tx.keyinfos) {
                        text_tx.textContent += "\t" + k + ":" + KeyType[this.tx.keyinfos[k].type] + "\r\n";
                        if (this.tx.keyinfos[k].type == KeyType.Unknow) {
                            text_tx.textContent += "\t\t" + "<unknow count....>" + "\r\n";
                        }
                        if (this.tx.keyinfos[k].type == KeyType.Simple) {
                            let signstr = this.tx.keyinfos[k].signdata[0] == null ? "<null>" : this.tx.keyinfos[k].signdata[0].toHexString();
                            text_tx.textContent += "\t\t" + "sign0" + signstr + "\r\n";
                        }
                        if (this.tx.keyinfos[k].type == KeyType.MultiSign) {
                            for (var i = 0; i < this.tx.keyinfos[k].MultiSignKey.MKey_Pubkeys.length; i++) {
                                var pubkey = this.tx.keyinfos[k].MultiSignKey.MKey_Pubkeys[i];
                                var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                                let signstr = this.tx.keyinfos[k].signdata[i] == null ? "<null>" : this.tx.keyinfos[k].signdata[i].toHexString();
                                text_tx.textContent += "\t\t" + "sign" + i + ":" + address + "=" + signstr + "\r\n";
                            }
                        }
                    }
                }
            };
            var updateDataUI = () => {
                text_data.value = this.tx.ToString();
            };
        }
    }
    NeoTest.Test_MultiSign = Test_MultiSign;
    class key {
        ToString() {
            if (this.multisignkey == false) {
                var pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(this.prikey);
                var address = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                return address;
            }
            else {
                try {
                    return "M" + this.MKey_NeedCount + "/" + this.MKey_Pubkeys.length + ":" + this.GetAddress();
                }
                catch (_a) {
                    return "M<error>";
                }
            }
        }
        GetMultiContract() {
            if (!(1 <= this.MKey_NeedCount && this.MKey_NeedCount <= this.MKey_Pubkeys.length && this.MKey_Pubkeys.length <= 1024))
                throw new Error();
            var sb = new ThinNeo.ScriptBuilder();
            {
                sb.EmitPushNumber(Neo.BigInteger.parse(this.MKey_NeedCount.toString()));
                for (var i = 0; i < this.MKey_Pubkeys.length; i++) {
                    var pkey = this.MKey_Pubkeys[i];
                    sb.EmitPushBytes(pkey);
                }
                sb.EmitPushNumber(Neo.BigInteger.parse(this.MKey_Pubkeys.length.toString()));
                sb.Emit(ThinNeo.OpCode.CHECKMULTISIG);
                return sb.ToArray();
            }
        }
        GetAddress() {
            if (this.multisignkey == false) {
                return this.ToString();
            }
            else {
                var contract = this.GetMultiContract();
                var scripthash = ThinNeo.Helper.GetScriptHashFromScript(contract);
                var address = ThinNeo.Helper.GetAddressFromScriptHash(scripthash);
                return address;
            }
        }
        AddPubkey(pubkey) {
            for (var i = 0; i < this.MKey_Pubkeys.length; i++) {
                var k = this.MKey_Pubkeys[i];
                if (k == pubkey)
                    return;
                var s1 = k.toHexString();
                var s2 = pubkey.toHexString();
                if (s1 == s2)
                    return;
            }
            this.MKey_Pubkeys.push(pubkey);
            this.MKey_Pubkeys.sort((a, b) => {
                var pa = Neo.Cryptography.ECPoint.decodePoint(a, Neo.Cryptography.ECCurve.secp256r1);
                var pb = Neo.Cryptography.ECPoint.decodePoint(b, Neo.Cryptography.ECCurve.secp256r1);
                return pa.compareTo(pb);
            });
        }
    }
    NeoTest.key = key;
    class Tx {
        HasKeyInfo() {
            for (var k in this.keyinfos.keys) {
                var value = this.keyinfos[k];
                if (value.type != KeyType.Unknow)
                    return true;
            }
            return false;
        }
        HasAllKeyInfo() {
            for (var k in this.keyinfos.keys) {
                var value = this.keyinfos[k];
                if (value.type == KeyType.Unknow)
                    return false;
                if (value.type == KeyType.Simple)
                    if (value.signdata == null || value.signdata[0] == null || value.signdata[0].length == 0)
                        return false;
                if (value.type == KeyType.MultiSign) {
                    var m = value.MultiSignKey.MKey_NeedCount;
                    var c = 0;
                    for (var i = 0; i < value.MultiSignKey.MKey_Pubkeys.length; i++) {
                        var data = value.signdata[i];
                        if (data != null && data.length > 0)
                            c++;
                    }
                    if (c < m)
                        return false;
                }
            }
            return true;
        }
        FillRaw() {
            this.txraw.witnesses = new ThinNeo.Witness[this.keyinfos.keys.length];
            var keys = new Array();
            for (var k in this.keyinfos.keys) {
                var value = this.keyinfos[k];
                keys.push(value);
            }
            for (let i = 0; i < keys.length; i++) {
                this.txraw.witnesses[i] = new ThinNeo.Witness();
                if (keys[i].type == KeyType.Simple) {
                    this.txraw.witnesses[i].VerificationScript = ThinNeo.Helper.GetPublicKeyScriptHashFromPublicKey(keys[i].pubKey);
                    var sb = new ThinNeo.ScriptBuilder();
                    sb.EmitPushBytes(keys[i].signdata[0]);
                    this.txraw.witnesses[i].InvocationScript = sb.ToArray();
                }
                if (keys[i].type == KeyType.MultiSign) {
                    this.txraw.witnesses[i].VerificationScript = keys[i].MultiSignKey.GetMultiContract();
                    var signs = new Array();
                    for (let ii = 0; ii < keys[i].signdata.length; ii++) {
                        var s = keys[i].signdata[ii];
                        if (s != null && s.length > 0) {
                            signs.push(s);
                        }
                    }
                    var sb = new ThinNeo.ScriptBuilder();
                    for (var iss = 0; iss < keys[i].MultiSignKey.MKey_NeedCount; iss++) {
                        sb.EmitPushBytes(signs[iss]);
                    }
                    this.txraw.witnesses[i].InvocationScript = sb.ToArray();
                }
            }
        }
        ToString() {
            var ms = new Neo.IO.MemoryStream();
            this.txraw.SerializeUnsigned(new Neo.IO.BinaryWriter(ms));
            var data = ms.toArray();
            var outstr = new Uint8Array(data, 0, data.byteLength).toHexString();
            if (this.HasKeyInfo) {
                var json = this.ExoprtKeyInfo();
                outstr += "|" + JSON.stringify(json);
            }
            return outstr;
        }
        ExoprtKeyInfo() {
            var json = {};
            for (var k in this.keyinfos) {
                var value = this.keyinfos[k];
                if (value.type == KeyType.Unknow) {
                    continue;
                }
                var keyitem = {};
                keyitem["type"] = KeyType[value["type"]];
                if (value["type"] == KeyType.Simple) {
                    var strsigndata = value["signdata"][0] == null ? "<null>" : value["signdata"][0].toHexString();
                    keyitem["sign0"] = strsigndata;
                    var strpubkey = value["pubKey"] == null ? "<null>" : value["pubKey"].toHexString();
                    keyitem["pkey0"] = strpubkey;
                }
                else if (value["type"] == KeyType.MultiSign) {
                    keyitem["m"] = value["MultiSignKey"]["MKey_NeedCount"];
                    keyitem["c"] = value["MultiSignKey"]["MKey_Pubkeys"].length;
                    for (let i = 0; i < value["MultiSignKey"]["MKey_Pubkeys"].length; i++) {
                        var strpubkey = value["MultiSignKey"]["MKey_Pubkeys"][i].toHexString();
                        keyitem["pkey" + i] = strpubkey;
                        var strsigndata = value["signdata"][i] == null ? "<null>" : value["signdata"][i].toHexString();
                        keyitem["sign" + i] = strsigndata;
                    }
                }
                json[value["keyaddress"]] = keyitem;
            }
            return json;
        }
        ImportKeyInfo(keys, json = null) {
            if (this.keyinfos == null) {
                this.keyinfos = new Map();
            }
            for (let i = 0; i < this.txraw.attributes.length; i++) {
                var att = this.txraw.attributes[i];
                if (att.usage == ThinNeo.TransactionAttributeUsage.Script) {
                    var addr = ThinNeo.Helper.GetAddressFromScriptHash(att.data);
                    if (!this.keyinfos[addr]) {
                        this.keyinfos[addr] = new KeyInfo();
                        this.keyinfos[addr].type = KeyType.Unknow;
                        this.keyinfos[addr].keyaddress = addr;
                    }
                    for (let ii = 0; ii < keys.length; ii++) {
                        let k = keys[ii];
                        if (k.GetAddress() == addr) {
                            if (k.multisignkey == false) {
                                this.keyinfos[addr].type = KeyType.Simple;
                                this.keyinfos[addr].pubKey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(k.prikey);
                                if (this.keyinfos[addr].signdata == null) {
                                    this.keyinfos[addr].signdata = new Array();
                                    this.keyinfos[addr].signdata.push(null);
                                }
                            }
                            else {
                                this.keyinfos[addr].type = KeyType.MultiSign;
                                this.keyinfos[addr].MultiSignKey = k;
                                if (this.keyinfos[addr].signdata == null) {
                                    this.keyinfos[addr].signdata = new Array();
                                    for (var iii = 0; iii < k.MKey_Pubkeys.length; iii++) {
                                        this.keyinfos[addr].signdata.push(null);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (json != null) {
                for (let k in json) {
                    if (!!this.keyinfos[k]) {
                        var type = json[k]["type"];
                        this.keyinfos[k].type = type;
                        if (this.keyinfos[k].type == KeyType[KeyType.Simple]) {
                            if (this.keyinfos[k].signdata == null) {
                                this.keyinfos[k].signdata = new Array();
                                this.keyinfos[k].signdata.push(null);
                            }
                            var data = json[k]["sign0"];
                            if (data != "<null>") {
                                this.keyinfos[k].signdata[0] = data.hexToBytes();
                            }
                            var pkey = json[k]["pkey0"];
                            this.keyinfos[k].pubkey = pkey.hexToBytes();
                        }
                        if (this.keyinfos[k].type == KeyType[KeyType.MultiSign]) {
                            var m = Number.parseInt(json[k]["m"]);
                            var c = Number.parseInt(json[k]["c"]);
                            var pubkeys = new Array();
                            if (this.keyinfos[k].signdata == null) {
                                this.keyinfos[k].signdata = new Array();
                                for (var i = 0; i < c; i++) {
                                    this.keyinfos[k].signdata.push(null);
                                }
                            }
                            for (var i = 0; i < c; i++) {
                                let data = json[k]["sign" + i];
                                if (data != "<null>") {
                                    this.keyinfos[k].signdata[i] = data.hexToBytes();
                                }
                                var pkey = json[k]["pkey" + i];
                                pubkeys.push(pkey.hexToBytes());
                            }
                            var _key = null;
                            for (var i = 0; i < keys.length; i++) {
                                var _k = keys[i].GetAddress();
                                if (_k == k) {
                                    _key = keys[i];
                                    break;
                                }
                            }
                            if (_key == null) {
                                _key = new key();
                                _key.MKey_NeedCount = m;
                                _key.MKey_Pubkeys = pubkeys;
                                _key.multisignkey = true;
                                _key.prikey = null;
                                keys.push(_key);
                            }
                            this.keyinfos[k].MultiSignKey = _key;
                        }
                    }
                }
            }
        }
        FromString(keys, info) {
            var txdata;
            var keyinfo = null;
            if (info.indexOf("|") > 0) {
                var ss = info.split("|");
                txdata = ss[0].hexToBytes();
                keyinfo = JSON.parse(ss[1]);
            }
            else {
                txdata = info.hexToBytes();
            }
            this.txraw = new ThinNeo.Transaction();
            var ms = new Neo.IO.MemoryStream(txdata.buffer, 0, txdata.byteLength);
            var br = new Neo.IO.BinaryReader(ms);
            this.txraw.Deserialize(br);
            this.ImportKeyInfo(keys, keyinfo);
        }
    }
    NeoTest.Tx = Tx;
    class KeyInfo {
    }
    NeoTest.KeyInfo = KeyInfo;
    let KeyType;
    (function (KeyType) {
        KeyType[KeyType["Unknow"] = 0] = "Unknow";
        KeyType[KeyType["Simple"] = 1] = "Simple";
        KeyType[KeyType["MultiSign"] = 2] = "MultiSign";
    })(KeyType = NeoTest.KeyType || (NeoTest.KeyType = {}));
})(NeoTest || (NeoTest = {}));
//# sourceMappingURL=app.js.mapvar __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var what;
(function (what) {
    class Main {
        start() {
            return __awaiter(this, void 0, void 0, function* () {
                yield what.CoinTool.initAllAsset();
                setTimeout(() => { this.update(); }, 1000);
                var divpanel = document.getElementById("panel");
                lightsPanel.panelMgr.instance().init(divpanel);
                lightsPanel.panelMgr.instance().setbackImg("res/back1.jpg");
                this.panelState = new what.panel_State();
                this.panelState.init(this);
                this.panelLoadKey = new what.panel_LoadKey();
                this.panelLoadKey.init(this);
                this.panelFunction = new what.panel_Function();
                this.panelFunction.init(this);
                this.panelTransaction = new what.panel_Transaction();
                this.panelTransaction.init(this);
                this.panelSign = new what.panel_Sign();
                this.panelSign.init(this);
                this.panelSign.panel.hide();
                this.panelUTXO = new what.panel_UTXO();
                this.panelUTXO.init(this);
            });
        }
        update() {
            this.panelState.update();
            setTimeout(() => { this.update(); }, 1000);
        }
    }
    what.Main = Main;
    window.onload = () => {
        var main = new Main();
        main.start();
    };
})(what || (what = {}));
var lightsPanel;
(function (lightsPanel) {
    let direction;
    (function (direction) {
        direction[direction["H_Left"] = 0] = "H_Left";
        direction[direction["H_Right"] = 1] = "H_Right";
        direction[direction["V_Top"] = 2] = "V_Top";
        direction[direction["V_Bottom"] = 3] = "V_Bottom";
    })(direction = lightsPanel.direction || (lightsPanel.direction = {}));
    class panel {
        constructor(div) {
            this.divRoot = null;
            this.subPanels = null;
            this.divTitle = null;
            this.divContent = null;
            this.divResize = null;
            this.btnFloat = null;
            this.btnClose = null;
            this.onClose = null;
            this.isFloat = false;
            this.canDrag = true;
            this.canScale = true;
            this.canDock = true;
            this.divRoot = div;
            this.divRoot["inv"] = this;
            for (var i = 0; i < this.divRoot.childElementCount; i++) {
                var div = this.divRoot.children[i];
                if (div != undefined && div.className == "dialog-content") {
                    this.divContent = div;
                    break;
                }
            }
        }
        setTitleText(txt) {
            var a = this.divTitle.children[1];
            a.text = txt;
        }
        setTitle(txt, img = null) {
            var a = this.divTitle.children[1];
            a.text = txt;
            var i = this.divTitle.children[0];
            if (img == null) {
                i.hidden = true;
            }
            else {
                i.hidden = false;
                if (img != "-")
                    i.src = img;
            }
        }
        splitWith(p, dir, v) {
            var parent = this.container;
            var pc = null;
            if (this.container.subPanels.length < this.container.maxPanelCount) {
                pc = this.container;
            }
            else {
                for (var i in parent.subPanels) {
                    if (parent.subPanels[i] == this) {
                        var dd = document.createElement("div");
                        dd.className = "full";
                        pc = new panelContainer(dd);
                        parent.addSubPanel(pc, parseInt(i));
                        pc.divRoot.style.left = this.divRoot.style.left;
                        pc.divRoot.style.top = this.divRoot.style.top;
                        pc.divRoot.style.right = this.divRoot.style.right;
                        pc.divRoot.style.bottom = this.divRoot.style.bottom;
                        pc.addSubPanel(this);
                    }
                }
            }
            if (dir == direction.H_Left) {
                this.divRoot.style.left = "1px";
                p.divRoot.style.left = "0px";
            }
            else if (dir == direction.H_Right) {
                p.divRoot.style.left = "1px";
                this.divRoot.style.left = "0px";
            }
            else if (dir == direction.V_Top) {
                this.divRoot.style.top = "1px";
                p.divRoot.style.top = "0px";
            }
            else if (dir == direction.V_Bottom) {
                p.divRoot.style.top = "1px";
                this.divRoot.style.top = "0px";
            }
            pc.addSubPanel(p);
            pc.onSplit(dir, v);
            return;
        }
        onDock(container) {
            this.container = container;
            this.isFloat = false;
            this.divRoot.style.boxShadow = "0px";
            this.btnFloat.hidden = !this.canDrag;
            this.btnClose.hidden = true;
            this.divResize.hidden = true;
            this.divTitle.style.cursor = "auto";
        }
        makeMini(width, height) {
            this.canDock = false;
            this.canScale = false;
            this.floatWidth = width;
            this.floatHeight = height;
            this.divTitle.textContent = "";
            this.divTitle.style.height = "12px";
            this.divTitle.style.width = "100%";
            this.divContent.style.top = "12px";
            this.divRoot.style.right = "auto";
            this.divRoot.style.bottom = "auto";
            this.divRoot.style.width = this.floatWidth + "px";
            this.divRoot.style.height = this.floatHeight + "px";
        }
        onFloat() {
            this.isFloat = true;
            this.divRoot.style.boxShadow = "1px 1px 3px #292929";
            this.btnFloat.hidden = true;
            if (this.onClose != null)
                this.btnClose.hidden = false;
            else
                this.btnClose.hidden = true;
            if (this.canDrag) {
                this.divTitle.style.cursor = "move";
            }
            else {
                this.divTitle.style.cursor = "auto";
            }
            this.divResize.hidden = !this.canScale;
            var pos = panelMgr.instance()._calcRootPos(this.divRoot);
            var cx = panelMgr.instance()._calcRootCenterPos();
            var dirx = cx.x - pos.x;
            if (dirx != 0)
                dirx /= Math.abs(dirx);
            var diry = cx.y - pos.y;
            if (diry != 0)
                diry /= Math.abs(diry);
            pos.x += dirx * 16;
            pos.y += diry * 16;
            if (this.floatWidth > panelMgr.instance().width - 32 - pos.x) {
                this.floatWidth = panelMgr.instance().width - 32 - pos.x;
            }
            if (this.floatHeight > panelMgr.instance().height - 32 - pos.y) {
                this.floatHeight = panelMgr.instance().height - 32 - pos.y;
            }
            if (this.floatWidth < 100) {
                this.floatWidth = 100;
            }
            if (this.floatHeight < 100) {
                this.floatHeight = 100;
            }
            if (pos.x > panelMgr.instance().width - this.floatWidth) {
                pos.x = panelMgr.instance().width - this.floatWidth;
            }
            if (pos.y > panelMgr.instance().height - this.floatHeight) {
                pos.y = panelMgr.instance().height - this.floatHeight;
            }
            this.divRoot.style.left = pos.x + "px";
            this.divRoot.style.top = pos.y + "px";
            this.divRoot.style.right = "auto";
            this.divRoot.style.bottom = "auto";
            this.divRoot.style.width = this.floatWidth + "px";
            this.divRoot.style.height = this.floatHeight + "px";
        }
        toCenter() {
            if (this.isFloat == false)
                return;
            this.divRoot.style.left = (panelMgr.instance().width - this.floatWidth) / 2 + "px";
            this.divRoot.style.top = (panelMgr.instance().height - this.floatHeight) / 2 + "px";
        }
        show() {
            this.divRoot.hidden = false;
        }
        hide() {
            this.divRoot.hidden = true;
        }
    }
    lightsPanel.panel = panel;
    class panelContainer {
        constructor(div) {
            this.divRoot = null;
            this.subPanels = [];
            this.divScale = null;
            this.divRoot = div;
            this.divRoot["inv"] = this;
        }
        get maxPanelCount() {
            return 2;
        }
        onSplit(dir, v) {
            if (dir == direction.H_Left || dir == direction.H_Right) {
                this.scalew = v;
                this.scaleh = 1;
            }
            else {
                this.scalew = 1;
                this.scaleh = v;
            }
            this._doSplit();
        }
        _doSplit() {
            var mgr = panelMgr.instance();
            if (this.divScale == null) {
                this.divScale = document.createElement("div");
                this.divRoot.appendChild(this.divScale);
                this.divScale.className = "dialog-split";
                this.divScale.style.position = "absolute";
                this.divScale.style.zIndex = "1000";
            }
            this.divScale.hidden = false;
            if (this.scaleh == 1) {
                this.divScale.style.height = "auto";
                this.divScale.style.top = "0px";
                this.divScale.style.bottom = "0px";
                this.divScale.style.width = "auto";
                this.divScale.style.left = this.scalew * 100 + "%";
                this.divScale.style.right = ((1 - this.scalew) * 100) + "%";
                this.divScale.style.marginLeft = "-3px";
                this.divScale.style.marginRight = "-3px";
                this.divScale.style.marginTop = "0px";
                this.divScale.style.marginBottom = "0px";
                this.divScale.style.cursor = "ew-resize";
                for (var i = 0; i < this.subPanels.length; i++) {
                    var subdiv = this.subPanels[i].divRoot;
                    if (subdiv.style.left == "0px") {
                        mgr._setDockPos(subdiv, "0px", "0px", (1 - this.scalew) * 100 + "%", "0px");
                    }
                    else {
                        mgr._setDockPos(subdiv, (this.scalew * 100) + "%", "0px", "0px", "0px");
                    }
                }
            }
            else if (this.scalew == 1) {
                this.divScale.style.height = "auto";
                this.divScale.style.left = "0px";
                this.divScale.style.right = "0px";
                this.divScale.style.width = "auto";
                this.divScale.style.top = this.scaleh * 100 + "%";
                this.divScale.style.bottom = ((1 - this.scaleh) * 100) + "%";
                this.divScale.style.marginTop = "-3px";
                this.divScale.style.marginBottom = "-3px";
                this.divScale.style.marginLeft = "0px";
                this.divScale.style.marginRight = "0px";
                this.divScale.style.cursor = "ns-resize";
                for (var i = 0; i < this.subPanels.length; i++) {
                    var subdiv = this.subPanels[i].divRoot;
                    if (subdiv.style.top == "0px") {
                        mgr._setDockPos(subdiv, "0px", "0px", "0px", (1 - this.scaleh) * 100 + "%");
                    }
                    else {
                        mgr._setDockPos(subdiv, "0px", (this.scaleh * 100) + "%", "0px", "0px");
                    }
                }
            }
            else {
                throw new Error("无效数据");
            }
        }
        onDock(container) {
            this.container = container;
        }
        addSubPanel(p, pos = -1) {
            if (p.divRoot.parentElement != null) {
                p.divRoot.parentElement.removeChild(p.divRoot);
            }
            if (p.container != null) {
                p.container.removeSubPanel(p);
            }
            this.divRoot.appendChild(p.divRoot);
            if (pos < 0)
                this.subPanels.push(p);
            else {
                this.subPanels[pos] = p;
            }
            p.onDock(this);
        }
        removeSubPanel(p) {
            var i = this.subPanels.indexOf(p);
            if (i >= 0) {
                this.subPanels.splice(i, 1);
                this.divRoot.removeChild(p.divRoot);
            }
            if (this.subPanels.length == 1) {
                this._fillStyle(this.subPanels[0].divRoot);
            }
            if (this.subPanels.length == 0 && this.container != null) {
                this.container.removeSubPanel(this);
            }
            p.container = null;
            if (this.subPanels.length < 2) {
                if (this.divScale != null)
                    this.divScale.hidden = true;
            }
        }
        _fillStyle(div) {
            div.style.left = "0px";
            div.style.top = "0px";
            div.style.width = "auto";
            div.style.height = "auto";
            div.style.right = "0px";
            div.style.bottom = "0px";
        }
        fill(p) {
            this.addSubPanel(p);
            this._fillStyle(p.divRoot);
            p.onDock(this);
        }
    }
    lightsPanel.panelContainer = panelContainer;
    class panelMgr {
        constructor() {
            this.urlfill = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGWlDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjaY2BgnuDo4uTKJMDAUFBUUuQe5BgZERmlwH6egY2BmYGBgYGBITG5uMAxIMCHgYGBIS8/L5UBA3y7xsDIwMDAcFnX0cXJlYE0wJpcUFTCwMBwgIGBwSgltTiZgYHhCwMDQ3p5SUEJAwNjDAMDg0hSdkEJAwNjAQMDg0h2SJAzAwNjCwMDE09JakUJAwMDg3N+QWVRZnpGiYKhpaWlgmNKflKqQnBlcUlqbrGCZ15yflFBflFiSWoKAwMD1A4GBgYGXpf8EgX3xMw8BUNTVQYqg4jIKAX08EGIIUByaVEZhMXIwMDAIMCgxeDHUMmwiuEBozRjFOM8xqdMhkwNTJeYNZgbme+y2LDMY2VmzWa9yubEtoldhX0mhwBHJycrZzMXM1cbNzf3RB4pnqW8xryH+IL5nvFXCwgJrBZ0E3wk1CisKHxYJF2UV3SrWJw4p/hWiRRJYcmjUhXSutJPZObIhsoJyp2V71HwUeRVvKA0RTlKRUnltepWtUZ1Pw1Zjbea+7QmaqfqWOsK6b7SO6I/36DGMMrI0ljS+LfJPdPDZivM+y0qLBOtfKwtbFRtRexY7L7aP3e47XjB6ZjzXpetruvdVrov9VjkudBrgfdCn8W+y/xW+a8P2Bq4N+hY8PmQW6HPwr5EMEUKRilFG8e4xUbF5cW3JMxO3Jx0Nvl5KlOaXLpNRlRmVdas7D059/KY8tULfAqLi2YXHy55WyZR7lJRWDmv6mz131q9uvj6SQ3HGn83G7Skt85ru94h2Ond1d59uJehz76/bsK+if8nO05pnXpiOu+M4JmzZj2aozW3ZN6+BVwLwxYtXvxxqcOyCcsfrjRe1br65lrddU3rb2402NSx+cFWq21Tt3/Y6btr1R6Oven7jh9QP9h56PURv6Obj4ufqD355LT3mS3nZM+3X/h0Ke7yqasW15bdEL3ZeuvrnfS7N+/7PDjwyPTx6qeKz2a+EHzZ9Zr5Td3bn+9LP3z6VPD53de8b+9+5P/88Lv4z7d/Vf//AwAqvx2K829RWwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAEAklEQVR42uzZT2xUVRTH8c+bGUopCLSWShAQxaSCRgmtLowYrQmogYCRaFNIY4RisQs3xpUYdhp3RkhVCjEqBhQWaogaS0ysLoRGgyEVIfzRSDQt1oiUQmnnuegwtOibts5Ma0zPW0xu3suc7zv3d+6597wglLKYSlWWWKRMdtblmANa7HVpGE+H/VdjmA97IzTUFYTwmqdC7ZoddFRnlgGYZI7bLFcuzttqMz8dhEzQk/SNHQ7Inc1Ra5kittkwFMCHVrR6QbvcWkyDteIUZNJCzF1WtNuRc/ck7fQtbMn0VEIVn6WDX2CeImFWjkOn/QY6vW+x2AYNeqMBlnAwNZhopWrT9WXhPpB0SKMT4KgzyrjO6WiAOziaFs5as3IQ/Psd86YedPpJGeWZAGZKBYxrTIFS8axm4FGNpRJ60OMMzMykgUGy6YP4QEVWjpigNSE95UG/nmKZsiAkkD8L+t8sA8AY2/8XIBz4GxumCCNlFZMQH7ZUzlNomokCBSZCt6I0T+/ghTkxDOdb1Y/0/e9ze0qCM2DPoJvbPH8lz4YCaFRPqE9yRAt0YXpBC10clBNx8Tp19lijZ2iAnWpCvzjsuB9dyjpdkya7SbkFildbrUldZoAmNecc8JbDOdZ9lRoLJdbrtTFan7Otu2SHTTl2T1KzZzULqReLBniJz+0dNIO5s07bHYPaqCmYZk2X3bpSw+nmSWS5TyCmywkXwEm7baIqCqCcU+kaOstGFVkDBAJ/2mdX6rUOwj1RAAs4pTstmodyFPpiT/gutQE6A7OiAMroTBXVhHmwwUdZ5mEo6ZVJ1SWpYR8kEtE1IryqpFb++m+8tkb+bwBhLDJXri4seSpb4/uBcYBxgHGA/wBAIOsymx3AgKNZ0B+QZFaH0xEDdFCc7q+dh1f1enn0ANq4MTX42QfOUp0cxUlJ+NIDi1Itmm67fG+apEdU5PXMPBCghQd94Qg45yuweNQAYvbbP9eTSsZwHajhXi+6e0wAEmjXlFhfYa6vHXLcH+KmjyoAdRq8N2Plw5a64KLAlMx9lTwsxT1WeT2mwFQzlCock1pQL6FIqdmu99zoToH0Vr07dRoZL8fjAGMOEPvboC8n/pJXdh8hBFGH07MUpSiS/Z+xnm5dmnV96lMt1aC4fDiNAviBGxTqRp9md7q1QkUuAvCxtnSvAB1RAG3Md63fETpis5tzUJ5jLmjTcaUH0t/b/0drp9hyW1N91ZNO5lh8JR6DlvjmqG7GzKByfh4cX7Z1lomzKjoNN9o52TNW5qEwlWiw2gS2Ox9k3H5+YlmXT+1zKt2wy9aKLfC4xSbwrjUM9XH5nTBf1jTw43UmW6jWEreYmqMQdGjVYsvlqvvXAH+q4om+d8gJAAAAAElFTkSuQmCC";
            this.urlleft = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGWlDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjaY2BgnuDo4uTKJMDAUFBUUuQe5BgZERmlwH6egY2BmYGBgYGBITG5uMAxIMCHgYGBIS8/L5UBA3y7xsDIwMDAcFnX0cXJlYE0wJpcUFTCwMBwgIGBwSgltTiZgYHhCwMDQ3p5SUEJAwNjDAMDg0hSdkEJAwNjAQMDg0h2SJAzAwNjCwMDE09JakUJAwMDg3N+QWVRZnpGiYKhpaWlgmNKflKqQnBlcUlqbrGCZ15yflFBflFiSWoKAwMD1A4GBgYGXpf8EgX3xMw8BUNTVQYqg4jIKAX08EGIIUByaVEZhMXIwMDAIMCgxeDHUMmwiuEBozRjFOM8xqdMhkwNTJeYNZgbme+y2LDMY2VmzWa9yubEtoldhX0mhwBHJycrZzMXM1cbNzf3RB4pnqW8xryH+IL5nvFXCwgJrBZ0E3wk1CisKHxYJF2UV3SrWJw4p/hWiRRJYcmjUhXSutJPZObIhsoJyp2V71HwUeRVvKA0RTlKRUnltepWtUZ1Pw1Zjbea+7QmaqfqWOsK6b7SO6I/36DGMMrI0ljS+LfJPdPDZivM+y0qLBOtfKwtbFRtRexY7L7aP3e47XjB6ZjzXpetruvdVrov9VjkudBrgfdCn8W+y/xW+a8P2Bq4N+hY8PmQW6HPwr5EMEUKRilFG8e4xUbF5cW3JMxO3Jx0Nvl5KlOaXLpNRlRmVdas7D059/KY8tULfAqLi2YXHy55WyZR7lJRWDmv6mz131q9uvj6SQ3HGn83G7Skt85ru94h2Ond1d59uJehz76/bsK+if8nO05pnXpiOu+M4JmzZj2aozW3ZN6+BVwLwxYtXvxxqcOyCcsfrjRe1br65lrddU3rb2402NSx+cFWq21Tt3/Y6btr1R6Oven7jh9QP9h56PURv6Obj4ufqD355LT3mS3nZM+3X/h0Ke7yqasW15bdEL3ZeuvrnfS7N+/7PDjwyPTx6qeKz2a+EHzZ9Zr5Td3bn+9LP3z6VPD53de8b+9+5P/88Lv4z7d/Vf//AwAqvx2K829RWwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAEAklEQVR42uzZT2xUVRTH8c+bGUopCLSWShAQxaSCRgmtLowYrQmogYCRaFNIY4RisQs3xpUYdhp3RkhVCjEqBhQWaogaS0ysLoRGgyEVIfzRSDQt1oiUQmnnuegwtOibts5Ma0zPW0xu3suc7zv3d+6597wglLKYSlWWWKRMdtblmANa7HVpGE+H/VdjmA97IzTUFYTwmqdC7ZoddFRnlgGYZI7bLFcuzttqMz8dhEzQk/SNHQ7Inc1Ra5kittkwFMCHVrR6QbvcWkyDteIUZNJCzF1WtNuRc/ck7fQtbMn0VEIVn6WDX2CeImFWjkOn/QY6vW+x2AYNeqMBlnAwNZhopWrT9WXhPpB0SKMT4KgzyrjO6WiAOziaFs5as3IQ/Psd86YedPpJGeWZAGZKBYxrTIFS8axm4FGNpRJ60OMMzMykgUGy6YP4QEVWjpigNSE95UG/nmKZsiAkkD8L+t8sA8AY2/8XIBz4GxumCCNlFZMQH7ZUzlNomokCBSZCt6I0T+/ghTkxDOdb1Y/0/e9ze0qCM2DPoJvbPH8lz4YCaFRPqE9yRAt0YXpBC10clBNx8Tp19lijZ2iAnWpCvzjsuB9dyjpdkya7SbkFildbrUldZoAmNecc8JbDOdZ9lRoLJdbrtTFan7Otu2SHTTl2T1KzZzULqReLBniJz+0dNIO5s07bHYPaqCmYZk2X3bpSw+nmSWS5TyCmywkXwEm7baIqCqCcU+kaOstGFVkDBAJ/2mdX6rUOwj1RAAs4pTstmodyFPpiT/gutQE6A7OiAMroTBXVhHmwwUdZ5mEo6ZVJ1SWpYR8kEtE1IryqpFb++m+8tkb+bwBhLDJXri4seSpb4/uBcYBxgHGA/wBAIOsymx3AgKNZ0B+QZFaH0xEDdFCc7q+dh1f1enn0ANq4MTX42QfOUp0cxUlJ+NIDi1Itmm67fG+apEdU5PXMPBCghQd94Qg45yuweNQAYvbbP9eTSsZwHajhXi+6e0wAEmjXlFhfYa6vHXLcH+KmjyoAdRq8N2Plw5a64KLAlMx9lTwsxT1WeT2mwFQzlCock1pQL6FIqdmu99zoToH0Vr07dRoZL8fjAGMOEPvboC8n/pJXdh8hBFGH07MUpSiS/Z+xnm5dmnV96lMt1aC4fDiNAviBGxTqRp9md7q1QkUuAvCxtnSvAB1RAG3Md63fETpis5tzUJ5jLmjTcaUH0t/b/0drp9hyW1N91ZNO5lh8JR6DlvjmqG7GzKByfh4cX7Z1lomzKjoNN9o52TNW5qEwlWiw2gS2Ox9k3H5+YlmXT+1zKt2wy9aKLfC4xSbwrjUM9XH5nTBf1jTw43UmW6jWEreYmqMQdGjVYsvlqvvXAH+q4om+d8gJAAAAAElFTkSuQmCC";
            this.divRoot = null;
            this.root = null;
            this.floatDiv = null;
            this.overDiv = null;
            this.overDiv_Show = null;
            this.overDiv_FillImg = null;
            this.overDiv_LeftImg = null;
            this.overDiv_RightImg = null;
            this.overDiv_TopImg = null;
            this.overDiv_BottomImg = null;
            this.backimg = null;
        }
        static instance() {
            if (panelMgr.g_this == null)
                panelMgr.g_this = new panelMgr();
            return panelMgr.g_this;
        }
        get width() {
            return this.divRoot.clientWidth;
        }
        get height() {
            return this.divRoot.clientHeight;
        }
        setbackImg(url) {
            this.backimg.src = url;
        }
        init(div) {
            this.divRoot = div;
            this.backimg = document.createElement("img");
            this.backimg.style.position = "absoutle";
            this.backimg.style.width = "100%";
            this.backimg.style.height = "100%";
            this.divRoot.appendChild(this.backimg);
            var panelDiv = document.createElement("div");
            panelDiv.className = "full";
            panelDiv.style.zIndex = "1";
            this.divRoot.appendChild(panelDiv);
            this.root = new panelContainer(panelDiv);
            this.floatDiv = document.createElement("div");
            this.floatDiv.className = "full";
            this.floatDiv.style.zIndex = "2";
            this.floatDiv.style.width = "0px";
            this.floatDiv.style.overflow = "visible";
            this.divRoot.appendChild(this.floatDiv);
            this.overDiv = document.createElement("div");
            this.overDiv.className = "full";
            this.overDiv.style.zIndex = "3";
            this.overDiv.style.background = "rgba(204, 0, 0, 0.48);";
            this.overDiv.style.overflow = "visible";
            this.overDiv.style.width = "0px";
            this.overDiv.hidden = true;
            this.divRoot.appendChild(this.overDiv);
            this._initOverDiv();
            var mode = 0;
            var px = 0;
            var py = 0;
            var dialog = null;
            var overobj = null;
            var btouch = false;
            var onDown = (ele, clientX, clientY) => {
                var stin = ele["className"];
                var stinp = "";
                if ((ele instanceof HTMLButtonElement) == false)
                    stinp = ele.parentElement["className"];
                this.overDiv_Show.hidden = true;
                this.overDiv_FillImg.hidden = true;
                this.overDiv_LeftImg.hidden = true;
                this.overDiv_RightImg.hidden = true;
                this.overDiv_TopImg.hidden = true;
                this.overDiv_BottomImg.hidden = true;
                if (stin == "dialog-title") {
                    var float = ele.parentElement["inv"].isFloat;
                    var drag = ele.parentElement["inv"].canDrag;
                    if (float == false || drag == false)
                        return;
                    var p = this._calcClientPos(ele);
                    px = clientX - p.x;
                    py = clientY - p.y;
                    mode = 1;
                    dialog = ele.parentElement;
                    this._moveTop(dialog);
                    this.overDiv.hidden = false;
                }
                else if (stinp == "dialog-title") {
                    var float = ele.parentElement.parentElement["inv"].isFloat;
                    var drag = ele.parentElement.parentElement["inv"].canDrag;
                    if (float == false || drag == false)
                        return;
                    var p = this._calcClientPos(ele);
                    px = clientX - p.x;
                    py = clientY - p.y;
                    mode = 1;
                    dialog = ele.parentElement.parentElement;
                    this._moveTop(dialog);
                    this.overDiv.hidden = false;
                }
                else if (stin == "dialog-resize") {
                    var float = ele.parentElement["inv"].isFloat;
                    if (float == false)
                        return;
                    var p = this._calcClientPos(ele);
                    px = clientX - p.x;
                    py = clientY - p.y;
                    mode = 2;
                    dialog = ele.parentElement;
                    this._moveTop(dialog);
                    return true;
                }
                else if (stin == "dialog-split") {
                    var p = this._calcClientPos(ele);
                    px = clientX - p.x;
                    py = clientY - p.y;
                    mode = 3;
                    dialog = ele.parentElement;
                    return true;
                }
                else {
                    var dd = ele;
                    while (dd != null) {
                        if (dd.className == "dialog" && dd instanceof HTMLDivElement) {
                            this._moveTop(dd);
                            break;
                        }
                        dd = dd.parentElement;
                    }
                    return false;
                }
            };
            var onUp = (clientX, clientY) => {
                mode = 0;
                this.overDiv.hidden = true;
                if (overobj == null) {
                    return false;
                }
                else if (overobj.id == "overDiv_FillImg") {
                    var inele = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (inele instanceof (panelContainer)) {
                        inele.fill(dialog["inv"]);
                    }
                    return true;
                }
                else if (overobj.id == "overDiv_LeftImg") {
                    overobj = null;
                    var inele = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (inele instanceof (panel)) {
                        inele.splitWith(dialog["inv"], direction.H_Left, 0.5);
                    }
                    return true;
                }
                else if (overobj.id == "overDiv_RightImg") {
                    overobj = null;
                    var inele = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (inele instanceof (panel)) {
                        inele.splitWith(dialog["inv"], direction.H_Right, 0.5);
                    }
                    return true;
                }
                else if (overobj.id == "overDiv_TopImg") {
                    overobj = null;
                    var inele = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (inele instanceof (panel)) {
                        inele.splitWith(dialog["inv"], direction.V_Top, 0.5);
                    }
                    return true;
                }
                else if (overobj.id == "overDiv_BottomImg") {
                    overobj = null;
                    var inele = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (inele instanceof (panel)) {
                        inele.splitWith(dialog["inv"], direction.V_Bottom, 0.5);
                    }
                    return true;
                }
                else {
                    return false;
                }
            };
            var onMove = (clientX, clientY) => {
                if (mode == 1) {
                    var pp = this.pickPanel(this.root, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    if (pp == null)
                        return;
                    var dock = dialog["inv"].canDock;
                    var pos = this._calcRootPos(pp.divRoot);
                    this.overDiv_FillImg.style.borderWidth = "0px";
                    this.overDiv_FillImg.style.margin = "4px";
                    this.overDiv_LeftImg.style.borderWidth = "0px";
                    this.overDiv_LeftImg.style.margin = "4px";
                    this.overDiv_RightImg.style.borderWidth = "0px";
                    this.overDiv_RightImg.style.margin = "4px";
                    this.overDiv_TopImg.style.borderWidth = "0px";
                    this.overDiv_TopImg.style.margin = "4px";
                    this.overDiv_BottomImg.style.borderWidth = "0px";
                    this.overDiv_BottomImg.style.margin = "4px";
                    if (dock) {
                        overobj = this.pickOverLay(clientX, clientY);
                    }
                    else {
                        overobj = null;
                    }
                    if (overobj == null) {
                        this.overDiv_Show.hidden = true;
                    }
                    else if (overobj.id == "overDiv_FillImg") {
                        this.overDiv_FillImg.style.borderColor = "#ffffff";
                        this.overDiv_FillImg.style.borderStyle = "solid";
                        this.overDiv_FillImg.style.borderWidth = "4px";
                        this.overDiv_FillImg.style.margin = "0px";
                        this.overDiv_Show.hidden = false;
                        this.overDiv_Show.style.left = pos.x + "px";
                        this.overDiv_Show.style.top = pos.y + "px";
                        this.overDiv_Show.style.width = pp.divRoot.clientWidth + "px";
                        this.overDiv_Show.style.height = pp.divRoot.clientHeight + "px";
                        this.overDiv_Show.style.right = "auto";
                        this.overDiv_Show.style.bottom = "auto";
                    }
                    else if (overobj.id == "overDiv_LeftImg" && overobj.hidden == false) {
                        this.overDiv_LeftImg.style.borderColor = "#ffffff";
                        this.overDiv_LeftImg.style.borderStyle = "solid";
                        this.overDiv_LeftImg.style.borderWidth = "4px";
                        this.overDiv_LeftImg.style.margin = "0px";
                        this.overDiv_Show.hidden = false;
                        this.overDiv_Show.style.left = pos.x + "px";
                        this.overDiv_Show.style.top = pos.y + "px";
                        this.overDiv_Show.style.width = (pp.divRoot.clientWidth / 2) + "px";
                        this.overDiv_Show.style.height = pp.divRoot.clientHeight + "px";
                        this.overDiv_Show.style.right = "auto";
                        this.overDiv_Show.style.bottom = "auto";
                    }
                    else if (overobj.id == "overDiv_RightImg" && overobj.hidden == false) {
                        this.overDiv_RightImg.style.borderColor = "#ffffff";
                        this.overDiv_RightImg.style.borderStyle = "solid";
                        this.overDiv_RightImg.style.borderWidth = "4px";
                        this.overDiv_RightImg.style.margin = "0px";
                        this.overDiv_Show.hidden = false;
                        this.overDiv_Show.style.left = (pos.x + pp.divRoot.clientWidth / 2) + "px";
                        this.overDiv_Show.style.top = pos.y + "px";
                        this.overDiv_Show.style.width = (pp.divRoot.clientWidth / 2) + "px";
                        this.overDiv_Show.style.height = pp.divRoot.clientHeight + "px";
                        this.overDiv_Show.style.right = "auto";
                        this.overDiv_Show.style.bottom = "auto";
                    }
                    else if (overobj.id == "overDiv_TopImg" && overobj.hidden == false) {
                        this.overDiv_TopImg.style.borderColor = "#ffffff";
                        this.overDiv_TopImg.style.borderStyle = "solid";
                        this.overDiv_TopImg.style.borderWidth = "4px";
                        this.overDiv_TopImg.style.margin = "0px";
                        this.overDiv_Show.hidden = false;
                        this.overDiv_Show.style.left = pos.x + "px";
                        this.overDiv_Show.style.top = (pos.y) + "px";
                        this.overDiv_Show.style.width = (pp.divRoot.clientWidth) + "px";
                        this.overDiv_Show.style.height = (pp.divRoot.clientHeight / 2) + "px";
                        this.overDiv_Show.style.right = "auto";
                        this.overDiv_Show.style.bottom = "auto";
                    }
                    else if (overobj.id == "overDiv_BottomImg" && overobj.hidden == false) {
                        this.overDiv_BottomImg.style.borderColor = "#ffffff";
                        this.overDiv_BottomImg.style.borderStyle = "solid";
                        this.overDiv_BottomImg.style.borderWidth = "4px";
                        this.overDiv_BottomImg.style.margin = "0px";
                        this.overDiv_Show.hidden = false;
                        this.overDiv_Show.style.left = pos.x + "px";
                        this.overDiv_Show.style.top = (pos.y + pp.divRoot.clientHeight / 2) + "px";
                        this.overDiv_Show.style.width = (pp.divRoot.clientWidth) + "px";
                        this.overDiv_Show.style.height = (pp.divRoot.clientHeight / 2) + "px";
                        this.overDiv_Show.style.right = "auto";
                        this.overDiv_Show.style.bottom = "auto";
                    }
                    else {
                        this.overDiv_Show.hidden = true;
                    }
                    var left = (clientX - (this.divRoot.offsetLeft + px));
                    var top = (clientY - (this.divRoot.offsetTop + py));
                    if (left < 0)
                        left = 0;
                    if (left > this.divRoot.offsetWidth - dialog.offsetWidth) {
                        left = this.divRoot.offsetWidth - dialog.offsetWidth;
                    }
                    if (top < 0)
                        top = 0;
                    if (top > this.divRoot.offsetHeight - dialog.offsetHeight) {
                        top = this.divRoot.offsetHeight - dialog.offsetHeight;
                    }
                    dialog.style.left = left + "px";
                    dialog.style.top = top + "px";
                    this.testOverlay(dock, clientX - this.divRoot.offsetLeft, clientY - this.divRoot.offsetTop);
                    return true;
                }
                else if (mode == 2) {
                    var width = (clientX - (this.divRoot.offsetLeft - px)) - dialog.offsetLeft;
                    if (width < 100)
                        width = 100;
                    if (width > this.divRoot.offsetWidth - dialog.offsetLeft)
                        width = this.divRoot.offsetWidth - dialog.offsetLeft;
                    var height = (clientY - (this.divRoot.offsetTop - py)) - dialog.offsetTop;
                    if (height < 100)
                        height = 100;
                    if (height > this.divRoot.offsetHeight - dialog.offsetTop)
                        height = this.divRoot.offsetHeight - dialog.offsetTop;
                    dialog.style.width = width + "px";
                    dialog.style.height = height + "px";
                    var p = dialog["inv"];
                    p.floatWidth = width;
                    p.floatHeight = height;
                    return true;
                }
                else if (mode == 3) {
                    var pos = this._calcRootPos(dialog);
                    var left = (clientX - (this.divRoot.offsetLeft - px)) - dialog.offsetLeft;
                    var top = (clientY - (this.divRoot.offsetTop - py)) - dialog.offsetTop;
                    if (left < 100)
                        left = 100;
                    if (top < 100)
                        top = 100;
                    if (left > dialog.offsetWidth - 100)
                        left = dialog.offsetWidth - 100;
                    if (top > dialog.offsetHeight - 100)
                        top = dialog.offsetHeight - 100;
                    var w = left / dialog.offsetWidth;
                    var h = top / dialog.offsetHeight;
                    var pc = dialog["inv"];
                    if (dialog.offsetWidth < 200)
                        w = pc.scalew;
                    if (dialog.offsetHeight < 200)
                        h = pc.scaleh;
                    if (pc.scalew == 1)
                        pc.onSplit(direction.V_Top, h);
                    if (pc.scaleh == 1)
                        pc.onSplit(direction.H_Left, w);
                    return true;
                }
                else {
                    return false;
                }
            };
            {
                var lastx;
                var lasty;
                this.divRoot.addEventListener("touchstart", (ev) => {
                    btouch = true;
                    lastx = ev.touches[0].clientX;
                    lasty = ev.touches[0].clientY;
                    var b = onDown(ev.target, lastx, lasty);
                    if (b)
                        ev.preventDefault();
                });
                this.divRoot.addEventListener("touchend", (ev) => {
                    var b = onUp(lastx, lasty);
                    if (b)
                        ev.preventDefault();
                });
                this.divRoot.addEventListener("touchcancel", (ev) => {
                    var b = onUp(lastx, lasty);
                    if (b)
                        ev.preventDefault();
                });
                this.divRoot.addEventListener("touchmove", (ev) => {
                    lastx = ev.touches[0].clientX;
                    lasty = ev.touches[0].clientY;
                    var b = onMove(lastx, lasty);
                    if (b)
                        ev.preventDefault();
                });
            }
            {
                this.divRoot.addEventListener("mousedown", (ev) => {
                    onDown(ev.target, ev.clientX, ev.clientY);
                });
                this.divRoot.addEventListener("mouseup", (ev) => {
                    onUp(ev.clientX, ev.clientY);
                });
                this.divRoot.addEventListener("mousemove", (ev) => {
                    onMove(ev.clientX, ev.clientY);
                });
            }
        }
        pickPanel(panel, cx, cy) {
            var b = this._inbox(panel, cx, cy);
            if (!b)
                return null;
            if (panel instanceof panelContainer) {
                for (var p in panel.subPanels) {
                    var sp = this.pickPanel(panel.subPanels[p], cx, cy);
                    if (sp != null)
                        return sp;
                }
            }
            return panel;
        }
        createPanel(name, width = 200, height = 200, customctor = null) {
            var div = document.createElement("div");
            div.className = "dialog";
            this.floatDiv.appendChild(div);
            var title = document.createElement("div");
            title.className = "dialog-title";
            div.appendChild(title);
            var i = document.createElement("img");
            i.draggable = false;
            title.appendChild(i);
            i.style.position = "absolute";
            i.style.top = "1px";
            i.style.left = "1px";
            i.style.width = "28px";
            i.style.height = "28px";
            i.src = "";
            var a = document.createElement("a");
            title.appendChild(a);
            a.text = name;
            a.style.lineHeight = "28px";
            a.style.left = "30px";
            a.style.position = "absolute";
            var content = document.createElement("div");
            content.className = "dialog-content";
            div.appendChild(content);
            var resize = document.createElement("div");
            resize.className = "dialog-resize";
            div.appendChild(resize);
            var button = document.createElement("button");
            button.textContent = "float";
            title.appendChild(button);
            button.style.position = "absolute";
            button.style.right = "4px";
            button.style.top = "4px";
            button.style.bottom = "4px";
            button.style.width = "40px";
            button.style.lineHeight = "22px";
            button.onclick = () => {
                this.floatPanel(p);
            };
            var buttonClose = document.createElement("button");
            buttonClose.textContent = "X";
            title.appendChild(buttonClose);
            buttonClose.style.position = "absolute";
            buttonClose.style.right = "4px";
            buttonClose.style.top = "4px";
            buttonClose.style.bottom = "4px";
            buttonClose.style.width = "20px";
            buttonClose.style.lineHeight = "22px";
            buttonClose.onclick = () => {
                p.onClose();
            };
            var p = null;
            if (customctor != null) {
                p = customctor(div);
            }
            else {
                p = new panel(div);
            }
            p.divTitle = title;
            p.divContent = content;
            p.divResize = resize;
            p.btnFloat = button;
            p.btnClose = buttonClose;
            p.name = name;
            p.isFloat = true;
            p.floatWidth = width;
            p.floatHeight = height;
            p.onFloat();
            return p;
        }
        toTop(panel) {
            if (panel != null) {
                this._moveTop(panel.divRoot);
            }
        }
        floatPanel(panel) {
            if (panel instanceof (panelContainer)) {
                throw new Error("panelContainer can't be float.");
            }
            if (panel.container == null)
                return;
            panel.onFloat();
            panel.container.removeSubPanel(panel);
            this.floatDiv.appendChild(panel.divRoot);
        }
        removePanel(panel) {
            if (panel.isFloat == false) {
                this.floatPanel(panel);
            }
            this.floatDiv.removeChild(panel.divRoot);
        }
        fillPanel(panel) {
            if (this.root.subPanels.length > 0) {
                throw new Error("只有在空的时候可以用");
            }
            this.root.fill(panel);
        }
        _moveTop(divsrc) {
            if (divsrc.style.zIndex == "")
                divsrc.style.zIndex = "1";
            var zme = parseInt(divsrc.style.zIndex);
            var needdec = false;
            for (var i = 0; i < this.floatDiv.childElementCount; i++) {
                var div = this.floatDiv.children[i];
                if (div == divsrc)
                    continue;
                if (div.style == undefined && div.style.zIndex == undefined)
                    continue;
                var zindex = parseInt(div.style.zIndex);
                if (zindex >= zme) {
                    needdec = true;
                    break;
                }
            }
            if (!needdec)
                return;
            var zindexmax = zme;
            for (var i = 0; i < this.floatDiv.childElementCount; i++) {
                var div = this.floatDiv.children[i];
                if (div == divsrc)
                    continue;
                if (div.style == undefined && div.style.zIndex == undefined)
                    continue;
                var zindex = parseInt(div.style.zIndex);
                zindexmax = Math.max(zindexmax, zindex);
                if (zindex > 0)
                    zindex--;
                div.style.zIndex = zindex.toString();
            }
            divsrc.style.zIndex = Math.max((zindexmax + 1), this.floatDiv.childElementCount).toString();
        }
        _initOverDiv() {
            this.overDiv_Show = document.createElement("div");
            this.overDiv_Show.className = "full";
            this.overDiv_Show.style.backgroundColor = "rgba(0, 20, 204, 0.48)";
            this.overDiv.appendChild(this.overDiv_Show);
            this.overDiv_FillImg = new Image();
            this.overDiv_FillImg.id = "overDiv_FillImg";
            this.overDiv_FillImg.src = this.urlfill;
            this.overDiv_FillImg.style.position = "absolute";
            this.overDiv_FillImg.style.width = "64px";
            this.overDiv_FillImg.style.height = "64px";
            this.overDiv.appendChild(this.overDiv_FillImg);
            this.overDiv_LeftImg = new Image();
            this.overDiv_LeftImg.id = "overDiv_LeftImg";
            this.overDiv_LeftImg.src = this.urlleft;
            this.overDiv_LeftImg.style.position = "absolute";
            this.overDiv_LeftImg.style.width = "64px";
            this.overDiv_LeftImg.style.height = "64px";
            this.overDiv.appendChild(this.overDiv_LeftImg);
            this.overDiv_RightImg = new Image();
            this.overDiv_RightImg.id = "overDiv_RightImg";
            this.overDiv_RightImg.src = this.urlleft;
            this.overDiv_RightImg.style.position = "absolute";
            this.overDiv_RightImg.style.width = "64px";
            this.overDiv_RightImg.style.height = "64px";
            this.overDiv.appendChild(this.overDiv_RightImg);
            this.overDiv_BottomImg = new Image();
            this.overDiv_BottomImg.id = "overDiv_BottomImg";
            this.overDiv_BottomImg.src = this.urlleft;
            this.overDiv_BottomImg.style.position = "absolute";
            this.overDiv_BottomImg.style.width = "64px";
            this.overDiv_BottomImg.style.height = "64px";
            this.overDiv.appendChild(this.overDiv_BottomImg);
            this.overDiv_TopImg = new Image();
            this.overDiv_TopImg.id = "overDiv_TopImg";
            this.overDiv_TopImg.src = this.urlleft;
            this.overDiv_TopImg.style.position = "absolute";
            this.overDiv_TopImg.style.width = "64px";
            this.overDiv_TopImg.style.height = "64px";
            this.overDiv.appendChild(this.overDiv_TopImg);
        }
        pickOverLay(cx, cy) {
            var cp = this._calcClientPos(this.overDiv_FillImg);
            if (cx > cp.x && cy > cp.y && cx < cp.x + 64 && cy < cp.y + 64)
                return this.overDiv_FillImg;
            var cp = this._calcClientPos(this.overDiv_LeftImg);
            if (cx > cp.x && cy > cp.y && cx < cp.x + 64 && cy < cp.y + 64)
                return this.overDiv_LeftImg;
            var cp = this._calcClientPos(this.overDiv_RightImg);
            if (cx > cp.x && cy > cp.y && cx < cp.x + 64 && cy < cp.y + 64)
                return this.overDiv_RightImg;
            var cp = this._calcClientPos(this.overDiv_TopImg);
            if (cx > cp.x && cy > cp.y && cx < cp.x + 64 && cy < cp.y + 64)
                return this.overDiv_TopImg;
            var cp = this._calcClientPos(this.overDiv_BottomImg);
            if (cx > cp.x && cy > cp.y && cx < cp.x + 64 && cy < cp.y + 64)
                return this.overDiv_BottomImg;
            return null;
        }
        testOverlay(usedock, cx, cy) {
            if (usedock == false) {
                this.overDiv_FillImg.hidden = true;
                this.overDiv_LeftImg.hidden = true;
                this.overDiv_RightImg.hidden = true;
                this.overDiv_TopImg.hidden = true;
                this.overDiv_BottomImg.hidden = true;
                return;
            }
            var inele = this.pickPanel(this.root, cx, cy);
            if (inele instanceof (panelContainer)) {
                this.overDiv_FillImg.hidden = true;
                this.overDiv_LeftImg.hidden = true;
                this.overDiv_RightImg.hidden = true;
                this.overDiv_TopImg.hidden = true;
                this.overDiv_BottomImg.hidden = true;
                if (inele.subPanels.length == 0) {
                    this.overDiv_FillImg.hidden = false;
                    this.overDiv_FillImg.style.left = (inele.divRoot.clientLeft + inele.divRoot.clientWidth / 2 - 32) + "px";
                    this.overDiv_FillImg.style.top = (inele.divRoot.clientTop + inele.divRoot.clientHeight / 2 - 32) + "px";
                }
            }
            else if (inele instanceof (panel)) {
                this.overDiv_FillImg.hidden = true;
                var pos = this._calcRootPos(inele.divRoot);
                this.overDiv_LeftImg.hidden = false;
                this.overDiv_LeftImg.style.left = (pos.x + inele.divRoot.clientWidth / 2 - 32 - 68) + "px";
                this.overDiv_LeftImg.style.top = (pos.y + inele.divRoot.clientHeight / 2 - 32) + "px";
                this.overDiv_RightImg.hidden = false;
                this.overDiv_RightImg.style.left = (pos.x + inele.divRoot.clientWidth / 2 - 32 + 68) + "px";
                this.overDiv_RightImg.style.top = (pos.y + inele.divRoot.clientHeight / 2 - 32) + "px";
                this.overDiv_TopImg.hidden = false;
                this.overDiv_TopImg.style.left = (pos.x + inele.divRoot.clientWidth / 2 - 32) + "px";
                this.overDiv_TopImg.style.top = (pos.y + inele.divRoot.clientHeight / 2 - 32 - 68) + "px";
                this.overDiv_BottomImg.hidden = false;
                this.overDiv_BottomImg.style.left = (pos.x + inele.divRoot.clientWidth / 2 - 32) + "px";
                this.overDiv_BottomImg.style.top = (pos.y + inele.divRoot.clientHeight / 2 - 32 + 68) + "px";
            }
        }
        _inbox(panel, cx, cy) {
            var divf = panel.divRoot;
            var left = 0;
            var top = 0;
            while (divf != null && divf != this.root.divRoot && divf != this.divRoot) {
                left += divf.offsetLeft;
                top += divf.offsetTop;
                divf = divf.parentElement;
            }
            if (cx < left || cy < top || cx >= (left + panel.divRoot.clientWidth) || cy >= (top + panel.divRoot.clientHeight)) {
                return false;
            }
            return true;
        }
        _setDockPos(div, x, y, r, b) {
            div.style.left = x;
            div.style.top = y;
            div.style.right = r;
            div.style.bottom = b;
            div.style.width = "auto";
            div.style.height = "auto";
        }
        _calcRootPos(div) {
            var divf = div;
            var left = 0;
            var top = 0;
            while (divf != null && divf != this.root.divRoot && divf != this.divRoot) {
                left += divf.offsetLeft;
                top += divf.offsetTop;
                divf = divf.parentElement;
            }
            return { x: left, y: top };
        }
        _calcClientPos(div) {
            var divf = div;
            var left = 0;
            var top = 0;
            while (divf != null) {
                left += divf.offsetLeft;
                top += divf.offsetTop;
                divf = divf.parentElement;
            }
            return { x: left, y: top };
        }
        _calcRootCenterPos() {
            return { x: this.divRoot.clientWidth / 2, y: this.divRoot.clientHeight / 2 };
        }
    }
    lightsPanel.panelMgr = panelMgr;
})(lightsPanel || (lightsPanel = {}));
var lightsPanel;
(function (lightsPanel) {
    class QuickDom {
        static addElement(panel, name) {
            var p = null;
            if (panel instanceof (lightsPanel.panel)) {
                p = panel.divContent;
            }
            else {
                p = panel;
            }
            var e = document.createElement(name);
            p.appendChild(e);
            return e;
        }
        static addA(panel, text, href = null) {
            var e = QuickDom.addElement(panel, "a");
            e.text = text;
            if (href != null)
                e.href = href;
            return e;
        }
        static addSpan(panel, text) {
            var e = QuickDom.addElement(panel, "Span");
            e.textContent = text;
            return e;
        }
        static addSpace(panel, width) {
            var e = QuickDom.addElement(panel, "div");
            e.style.width = width + "px";
            e.style.height = "1px";
            return e;
        }
        static addReturn(panel) {
            var e = QuickDom.addElement(panel, "br");
            return e;
        }
        static addTextInput(panel, text = "") {
            var e = QuickDom.addElement(panel, "input");
            e.type = "text";
            e.value = text;
            return e;
        }
        static addTextInputPassword(panel, text = "") {
            var e = QuickDom.addElement(panel, "input");
            e.type = "password";
            e.value = text;
            return e;
        }
        static addButton(panel, text = "") {
            var e = QuickDom.addElement(panel, "button");
            e.title = text;
            e.value = text;
            e.textContent = text;
            return e;
        }
    }
    lightsPanel.QuickDom = QuickDom;
})(lightsPanel || (lightsPanel = {}));
var lightsPanel;
(function (lightsPanel) {
    class treeNode {
        constructor() {
            this.left = 0;
        }
        getDivForChild() {
            if (this.divForChild != null)
                return this.divForChild;
            this.divForChild = document.createElement("div");
            this.divForChild.style.position = "relative";
            this.divForChild.style.overflow = "auto";
            this.divForChild.style.overflowX = "hidden";
            this.divForChild.style.overflowY = "auto";
            this.divForChild.style.left = "0px";
            this.divNode.appendChild(this.divForChild);
            return this.divForChild;
        }
        MakeLength(len) {
            if (len == 0)
                return;
            if (this.children == null)
                this.children = [];
            for (var i = this.children.length; i < len; i++) {
                var nnode = new treeNode();
                nnode.parent = this;
                this.children.push(nnode);
            }
            for (var i = len; i < this.children.length; i++) {
                this.children[i].hide();
            }
        }
        FillData(treeview, filter, data) {
            this.data = data;
            if (this.divNode == null) {
                this.divNode = document.createElement("div");
                this.divNode.style.position = "relative";
                this.divNode.style.overflow = "auto";
                this.divNode.style.overflowX = "hidden";
                this.divNode.style.overflowY = "auto";
                this.parent.getDivForChild().appendChild(this.divNode);
            }
            if (this.divText == null) {
                this.divChildButton = document.createElement("button");
                this.divChildButton.textContent = "-";
                this.divChildButton.style.position = "relative";
                this.divChildButton.style.width = "24px";
                this.divChildButton.style.left = this.left + "px";
                this.divChildButton.onclick = () => {
                    if (this.divForChild == null)
                        return;
                    this.divForChild.hidden = !this.divForChild.hidden;
                    if (this.divForChild.hidden == true) {
                        this.divChildButton.textContent = "+";
                    }
                    else {
                        this.divChildButton.textContent = "-";
                    }
                };
                this.divText = document.createElement("div");
                this.divText.style.position = "relative";
                this.divText.style.overflow = "auto";
                this.divText.style.overflowX = "hidden";
                this.divText.style.overflowY = "auto";
                var text = document.createElement("a");
                text.style.cursor = "default";
                text.style.position = "relative";
                text.style.left = (this.left) + "px";
                text.hidden = false;
                this.divText.appendChild(this.divChildButton);
                this.divText.appendChild(text);
                this.divNode.appendChild(this.divText);
            }
            treeview.makeSelectEvent(this);
            this.divText.childNodes[1].text = data.name;
            this.divText.childNodes[1].style.color = data.txtcolor;
            var children = filter.getChildren(data);
            this.divChildButton.hidden = (children.length == 0);
            this.MakeLength(children.length);
            for (var i = 0; i < children.length; i++) {
                this.children[i].left = this.left + 16;
                this.children[i].show();
                this.children[i].FillData(treeview, filter, children[i]);
            }
        }
        hide() {
            if (this.divNode != null) {
                this.divNode.hidden = true;
            }
        }
        show() {
            if (this.divNode != null) {
                this.divNode.hidden = false;
            }
        }
    }
    lightsPanel.treeNode = treeNode;
    class treeView {
        constructor(parent) {
            this.nodeRoot = new treeNode();
            this.onSelectItem = null;
            this.selectItem = null;
            this.treeArea = document.createElement("div");
            this.treeArea.className = "full";
            this.treeArea.style.overflow = "auto";
            this.treeArea.style.overflowX = "hidden";
            this.treeArea.style.overflowY = "auto";
            this.treeArea["inv"] = this;
            this.nodeRoot.divForChild = this.treeArea;
            if (parent instanceof lightsPanel.panel) {
                parent.divContent.textContent = "";
                parent.divContent.appendChild(this.treeArea);
            }
            else {
                parent.textContent = "";
                parent.appendChild(this.treeArea);
            }
        }
        onSelect(node) {
            this.selectItem = node;
            if (this.onSelectItem != null) {
                this.onSelectItem(node.divText.childNodes[1].text, node.data);
            }
        }
        makeSelectEvent(node) {
            node.divText.onclick = () => {
                if (this.selectItem != null) {
                    this.selectItem.divText.style.background = "transparent";
                }
                this.onSelect(node);
                if (this.selectItem != null) {
                    this.selectItem.divText.style.background = "#aaa";
                }
            };
        }
        updateData(filter) {
            var child = filter.getChildren(null);
            var ccount = child.length;
            this.nodeRoot.MakeLength(ccount);
            if (this.nodeRoot.children != null) {
                for (var i = 0; i < ccount; i++) {
                    var node = this.nodeRoot.children[i];
                    node.show();
                    node.FillData(this, filter, child[i]);
                }
            }
        }
    }
    lightsPanel.treeView = treeView;
})(lightsPanel || (lightsPanel = {}));
var what;
(function (what) {
    let FuncTag;
    (function (FuncTag) {
        FuncTag[FuncTag["transfer"] = 0] = "transfer";
        FuncTag[FuncTag["DApp_WhoAmI"] = 1] = "DApp_WhoAmI";
    })(FuncTag = what.FuncTag || (what.FuncTag = {}));
    class panel_Function {
        constructor() {
        }
        init(main) {
            this.main = main;
            this.panel = lightsPanel.panelMgr.instance().createPanel("Function");
            this.panel.divRoot.style.left = "30px";
            this.panel.divRoot.style.top = "200px";
            this.panel.floatWidth = 300;
            this.panel.floatHeight = 350;
            this.panel.canDrag = true;
            this.panel.canScale = true;
            this.panel.onFloat();
            this.setFunc(FuncTag.transfer);
        }
        setFunc(tag) {
            this.panel.divContent.textContent = "";
            if (tag == FuncTag.transfer) {
                lightsPanel.QuickDom.addSpan(this.panel, "Transfer");
            }
            else {
                var btn = lightsPanel.QuickDom.addButton(this.panel, "Transfer");
                btn.onclick = () => {
                    this.setFunc(FuncTag.transfer);
                };
            }
            if (tag == FuncTag.DApp_WhoAmI) {
                lightsPanel.QuickDom.addSpan(this.panel, "DApp_WhoAmI");
            }
            else {
                var btn = lightsPanel.QuickDom.addButton(this.panel, "DApp_WhoAmI");
                btn.onclick = () => {
                    this.setFunc(FuncTag.DApp_WhoAmI);
                };
            }
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            if (tag == FuncTag.transfer) {
                this.initTransfer();
            }
            if (tag == FuncTag.DApp_WhoAmI) {
                this.initDApp_WhoAmI();
            }
        }
        initTransfer() {
            lightsPanel.QuickDom.addSpan(this.panel, "Target");
            var target = lightsPanel.QuickDom.addTextInput(this.panel, "AdzQq1DmnHq86yyDUkU3jKdHwLUe2MLAVv");
            lightsPanel.QuickDom.addElement(this.panel, "br");
            lightsPanel.QuickDom.addSpan(this.panel, "Asset Type:");
            var select = document.createElement("select");
            this.panel.divContent.appendChild(select);
            for (var name in what.CoinTool.name2assetID) {
                var sitem = document.createElement("option");
                sitem.text = name;
                select.appendChild(sitem);
            }
            lightsPanel.QuickDom.addElement(this.panel, "br");
            lightsPanel.QuickDom.addSpan(this.panel, "Count");
            var count = lightsPanel.QuickDom.addTextInput(this.panel, "");
            lightsPanel.QuickDom.addElement(this.panel, "br");
            var btn = lightsPanel.QuickDom.addButton(this.panel, "MakeTransaction");
            btn.onclick = () => {
                var targetaddr = target.value;
                var asset = select.childNodes[select.selectedIndex].text;
                var assetid = what.CoinTool.name2assetID[asset];
                var _count = Neo.Fixed8.parse(count.value);
                var tran = what.CoinTool.makeTran(this.main.panelUTXO.assets, targetaddr, assetid, _count);
                this.main.panelTransaction.setTran(tran);
            };
            lightsPanel.QuickDom.addElement(this.panel, "br");
        }
        initDApp_WhoAmI() {
            var pkey = this.main.panelLoadKey.pubkey;
            lightsPanel.QuickDom.addSpan(this.panel, "(No need key)");
            lightsPanel.QuickDom.addElement(this.panel, "br");
            lightsPanel.QuickDom.addSpan(this.panel, "Target");
            var target = lightsPanel.QuickDom.addTextInput(this.panel, pkey == null ? "AdzQq1DmnHq86yyDUkU3jKdHwLUe2MLAVv" : this.main.panelLoadKey.address);
            lightsPanel.QuickDom.addElement(this.panel, "br");
            var btn = lightsPanel.QuickDom.addButton(this.panel, "getName");
            lightsPanel.QuickDom.addElement(this.panel, "br");
            var result = lightsPanel.QuickDom.addSpan(this.panel, "result=");
            btn.onclick = () => __awaiter(this, void 0, void 0, function* () {
                var targetaddr = target.value;
                var scriptaddress = "0x42832a25cf11d0ceee5629cb8b4daee9bac207ca";
                var key = ThinNeo.Helper.GetPublicKeyScriptHash_FromAddress(targetaddr);
                var script = scriptaddress.hexToBytes();
                var r = yield what.WWW.rpc_getStorage(script, key);
                if (r == null || r == undefined) {
                    result.textContent = "no name";
                }
                else {
                    var hex = r.hexToBytes();
                    result.textContent = "name=" + ThinNeo.Helper.Bytes2String(hex);
                }
            });
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            if (pkey != null) {
                var pkeyhash = ThinNeo.Helper.GetPublicKeyScriptHashFromPublicKey(pkey);
                lightsPanel.QuickDom.addSpan(this.panel, "(need key)");
                lightsPanel.QuickDom.addElement(this.panel, "br");
                lightsPanel.QuickDom.addSpan(this.panel, "cur addr=" + this.main.panelLoadKey.address);
                lightsPanel.QuickDom.addElement(this.panel, "br");
                var inputName = lightsPanel.QuickDom.addTextInput(this.panel, "");
                lightsPanel.QuickDom.addElement(this.panel, "br");
                var btnSetName = lightsPanel.QuickDom.addButton(this.panel, "setName");
                btnSetName.onclick = () => {
                    var targetaddr = this.main.panelLoadKey.address;
                    var assetid = what.CoinTool.id_GAS;
                    var _count = Neo.Fixed8.Zero;
                    var tran = what.CoinTool.makeTran(this.main.panelUTXO.assets, targetaddr, assetid, _count);
                    tran.type = ThinNeo.TransactionType.InvocationTransaction;
                    tran.extdata = new ThinNeo.InvokeTransData();
                    let script = null;
                    var sb = new ThinNeo.ScriptBuilder();
                    var scriptaddress = "0x42832a25cf11d0ceee5629cb8b4daee9bac207ca".hexToBytes().reverse();
                    sb.EmitPushString(inputName.value);
                    sb.EmitPushBytes(this.main.panelLoadKey.pubkey);
                    sb.EmitAppCall(scriptaddress);
                    tran.extdata.script = sb.ToArray();
                    tran.extdata.gas = Neo.Fixed8.fromNumber(1.0);
                    this.main.panelTransaction.setTran(tran);
                };
            }
        }
    }
    what.panel_Function = panel_Function;
})(what || (what = {}));
var what;
(function (what) {
    class panel_LoadKey {
        constructor() {
        }
        init(main) {
            this.main = main;
            this.panel = lightsPanel.panelMgr.instance().createPanel("Key Info");
            this.panel.divRoot.style.left = "400px";
            this.panel.divRoot.style.top = "30px";
            this.panel.floatWidth = 400;
            this.panel.floatHeight = 150;
            this.panel.canDrag = true;
            this.panel.canScale = true;
            this.panel.onFloat();
            this.panel.divContent.textContent = "";
            lightsPanel.QuickDom.addSpan(this.panel, "Load NEP6 File");
            var file = document.createElement("input");
            this.panel.divContent.appendChild(file);
            file.type = "file";
            var wallet;
            var reader = new FileReader();
            reader.onload = (e) => {
                var walletstr = reader.result;
                wallet = new ThinNeo.nep6wallet();
                wallet.fromJsonStr(walletstr);
                this.keylist.textContent = "";
                for (var i = 0; i < wallet.accounts.length; i++) {
                    if (wallet.accounts[i].nep2key != null) {
                        let nepkey = wallet.accounts[i].nep2key;
                        var s = wallet.scrypt;
                        var btn = document.createElement("button");
                        btn.textContent = "use " + wallet.accounts[i].address;
                        btn.onclick = () => {
                            var pass = prompt("password?");
                            ThinNeo.Helper.GetPrivateKeyFromNep2(nepkey, pass, s.N, s.r, s.p, (info, result) => {
                                if (info == "finish") {
                                    this.setKey(result);
                                }
                            });
                        };
                        this.keylist.appendChild(btn);
                    }
                }
            };
            file.onchange = (ev) => {
                if (file.files[0].name.includes(".json")) {
                    reader.readAsText(file.files[0]);
                }
            };
            this.keylist = document.createElement("div");
            this.panel.divContent.appendChild(this.keylist);
            this.panel.divContent.appendChild(document.createElement("br"));
            this.spanKey = lightsPanel.QuickDom.addSpan(this.panel, "");
        }
        setKey(key) {
            this.prikey = key;
            this.pubkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(this.prikey);
            this.address = ThinNeo.Helper.GetAddressFromPublicKey(this.pubkey);
            this.keylist.textContent = "";
            this.spanKey.textContent = "usekey= " + this.address;
            var btn = lightsPanel.QuickDom.addButton(this.keylist, "refresh UTXO");
            btn.onclick = () => {
                this.main.panelUTXO.refresh();
            };
            this.main.panelUTXO.refresh();
        }
    }
    what.panel_LoadKey = panel_LoadKey;
})(what || (what = {}));
var what;
(function (what) {
    class panel_Sign {
        constructor() {
        }
        init(main) {
            this.main = main;
            this.panel = lightsPanel.panelMgr.instance().createPanel("Sign");
            this.panel.onClose = () => {
                this.panel.hide();
                this.main.panelTransaction.panel.show();
            };
            this.panel.divRoot.style.left = "400px";
            this.panel.divRoot.style.top = "200px";
            this.panel.floatWidth = 1000;
            this.panel.floatHeight = 600;
            this.panel.canDrag = true;
            this.panel.canScale = true;
            this.panel.onFloat();
            this.panel.divContent.textContent = "";
        }
        setTran(tran, inputaddr) {
            if (tran.witnesses == null)
                tran.witnesses = [];
            let txid = tran.GetHash().clone().reverse().toHexString();
            this.panel.divContent.textContent = "";
            var a = lightsPanel.QuickDom.addA(this.panel, "TXID:" + txid, "http://be.nel.group/page/txInfo.html?txid=" + txid);
            a.target = "_blank";
            lightsPanel.QuickDom.addSpan(this.panel, "need witness:");
            lightsPanel.QuickDom.addElement(this.panel, "br");
            for (var i = 0; i < inputaddr.length; i++) {
                lightsPanel.QuickDom.addSpan(this.panel, "Withess[" + i + "]:" + inputaddr[i]);
                lightsPanel.QuickDom.addElement(this.panel, "br");
                var hadwit = false;
                for (var w = 0; w < tran.witnesses.length; w++) {
                    if (tran.witnesses[w].Address == inputaddr[i]) {
                        lightsPanel.QuickDom.addSpan(this.panel, "V_script:" + tran.witnesses[w].VerificationScript.toHexString());
                        lightsPanel.QuickDom.addElement(this.panel, "br");
                        lightsPanel.QuickDom.addSpan(this.panel, "I_script:" + tran.witnesses[w].InvocationScript.toHexString());
                        lightsPanel.QuickDom.addElement(this.panel, "br");
                        let witi = w;
                        var btn = lightsPanel.QuickDom.addButton(this.panel, "delete witness");
                        btn.onclick = () => {
                            tran.witnesses.splice(witi, 1);
                            this.setTran(tran, inputaddr);
                            return;
                        };
                        hadwit = true;
                        break;
                    }
                }
                if (hadwit == false) {
                    lightsPanel.QuickDom.addSpan(this.panel, "NoWitness");
                    lightsPanel.QuickDom.addElement(this.panel, "br");
                    if (inputaddr[i] == this.main.panelLoadKey.address) {
                        var btn = lightsPanel.QuickDom.addButton(this.panel, "Add witness by current key");
                        btn.onclick = () => {
                            var msg = tran.GetMessage();
                            var pubkey = this.main.panelLoadKey.pubkey;
                            var signdata = ThinNeo.Helper.Sign(msg, this.main.panelLoadKey.prikey);
                            tran.AddWitness(signdata, pubkey, this.main.panelLoadKey.address);
                            this.setTran(tran, inputaddr);
                        };
                    }
                }
                lightsPanel.QuickDom.addElement(this.panel, "hr");
                var btn = lightsPanel.QuickDom.addButton(this.panel, "boardcast it.");
                btn.onclick = () => __awaiter(this, void 0, void 0, function* () {
                    var result = yield what.WWW.rpc_postRawTransaction(tran.GetRawData());
                    if (result == true) {
                        alert("txid=" + txid);
                    }
                });
            }
        }
    }
    what.panel_Sign = panel_Sign;
})(what || (what = {}));
var what;
(function (what) {
    class panel_State {
        constructor() {
        }
        init(main) {
            this.main = main;
            this.panel = lightsPanel.panelMgr.instance().createPanel("API States(Refresh per 1 sec)");
            this.panel.divRoot.style.left = "30px";
            this.panel.divRoot.style.top = "30px";
            this.panel.floatWidth = 300;
            this.panel.floatHeight = 150;
            this.panel.canDrag = true;
            this.panel.canScale = true;
            this.panel.onFloat();
            this.panel.divContent.textContent = "";
            lightsPanel.QuickDom.addSpan(this.panel, "API=" + what.WWW.api);
            lightsPanel.QuickDom.addElement(this.panel, "br");
            this.spanAPIHeight = lightsPanel.QuickDom.addSpan(this.panel, "");
            lightsPanel.QuickDom.addElement(this.panel, "br");
        }
        update() {
            return __awaiter(this, void 0, void 0, function* () {
                this.spanAPIHeight.textContent = "API height=" + (yield what.WWW.api_getHeight());
            });
        }
    }
    what.panel_State = panel_State;
})(what || (what = {}));
var what;
(function (what) {
    class panel_Transaction {
        constructor() {
        }
        init(main) {
            this.main = main;
            this.panel = lightsPanel.panelMgr.instance().createPanel("Transaction");
            this.panel.divRoot.style.left = "400px";
            this.panel.divRoot.style.top = "200px";
            this.panel.floatWidth = 1000;
            this.panel.floatHeight = 600;
            this.panel.canDrag = true;
            this.panel.canScale = true;
            this.panel.onFloat();
            this.panel.divContent.textContent = "";
        }
        setTran(tran) {
            this.panel.divContent.textContent = "";
            lightsPanel.QuickDom.addSpan(this.panel, "type=" + ThinNeo.TransactionType[tran.type].toString());
            lightsPanel.QuickDom.addElement(this.panel, "br");
            lightsPanel.QuickDom.addSpan(this.panel, "version=" + tran.version);
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            var inputAddrs = [];
            lightsPanel.QuickDom.addSpan(this.panel, "inputcount=" + tran.inputs.length);
            lightsPanel.QuickDom.addElement(this.panel, "br");
            for (var i = 0; i < tran.inputs.length; i++) {
                var _addr = tran.inputs[i]["_addr"];
                if (inputAddrs.indexOf(_addr) < 0) {
                    inputAddrs.push(_addr);
                }
                var rhash = tran.inputs[i].hash.clone().reverse();
                var inputhash = rhash.toHexString();
                var outstr = "    input[" + i + "]" + inputhash + "(" + tran.inputs[i].index + ")";
                var a = lightsPanel.QuickDom.addA(this.panel, outstr, "http://be.nel.group/page/txInfo.html?txid=" + inputhash);
                a.target = "_blank";
                lightsPanel.QuickDom.addElement(this.panel, "br");
            }
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            lightsPanel.QuickDom.addSpan(this.panel, "outputcount=" + tran.outputs.length);
            lightsPanel.QuickDom.addElement(this.panel, "br");
            for (var i = 0; i < tran.outputs.length; i++) {
                var addrt = tran.outputs[i].toAddress;
                var address = ThinNeo.Helper.GetAddressFromScriptHash(addrt);
                var a = lightsPanel.QuickDom.addA(this.panel, "    outputs[" + i + "]" + address, "http://be.nel.group/page/address.html?addr=" + address);
                a.target = "_blank";
                var assethash = tran.outputs[i].assetId.clone().reverse();
                var assetid = "0x" + assethash.toHexString();
                if (inputAddrs.length == 1 && address == inputAddrs[0]) {
                    lightsPanel.QuickDom.addSpan(this.panel, "    (change)" + what.CoinTool.assetID2name[assetid] + "=" + tran.outputs[i].value.toString());
                }
                else {
                    lightsPanel.QuickDom.addSpan(this.panel, "    " + what.CoinTool.assetID2name[assetid] + "=" + tran.outputs[i].value.toString());
                }
                lightsPanel.QuickDom.addElement(this.panel, "br");
            }
            if (tran.type == ThinNeo.TransactionType.InvocationTransaction && tran.extdata != null) {
                var scriptdata = tran.extdata;
                lightsPanel.QuickDom.addElement(this.panel, "hr");
                lightsPanel.QuickDom.addSpan(this.panel, "call script:");
                var ops = ThinNeo.Compiler.Avm2Asm.Trans(scriptdata.script);
                for (var i = 0; i < ops.length; i++) {
                    lightsPanel.QuickDom.addSpan(this.panel, ops[i].toString());
                    lightsPanel.QuickDom.addElement(this.panel, "br");
                }
            }
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            let msg = tran.GetMessage();
            var msglen = msg.length;
            var txid = tran.GetHash().toHexString();
            lightsPanel.QuickDom.addSpan(this.panel, "--this TXLen=" + msglen);
            lightsPanel.QuickDom.addSpan(this.panel, "--this TXID=" + txid);
            lightsPanel.QuickDom.addElement(this.panel, "br");
            for (var i = 0; i < inputAddrs.length; i++) {
                lightsPanel.QuickDom.addSpan(this.panel, "must witness[" + i + "]=" + inputAddrs[i]);
            }
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            var btnsign = lightsPanel.QuickDom.addButton(this.panel, "Sign");
            btnsign.onclick = () => {
                this.panel.hide();
                tran.witnesses = [];
                this.main.panelSign.setTran(tran, inputAddrs);
                this.main.panelSign.panel.show();
            };
            lightsPanel.QuickDom.addElement(this.panel, "hr");
            lightsPanel.QuickDom.addSpan(this.panel, msg.toHexString());
        }
    }
    what.panel_Transaction = panel_Transaction;
})(what || (what = {}));
var what;
(function (what) {
    class panel_UTXO {
        constructor() {
        }
        init(main) {
            return __awaiter(this, void 0, void 0, function* () {
                this.main = main;
                this.panel = lightsPanel.panelMgr.instance().createPanel("UTXO");
                this.panel.divRoot.style.left = "920px";
                this.panel.divRoot.style.top = "30px";
                this.panel.floatWidth = 400;
                this.panel.floatHeight = 150;
                this.panel.canDrag = true;
                this.panel.canScale = true;
                this.panel.onFloat();
                this.panel.divContent.textContent = "";
                this.tree = new lightsPanel.treeView(this.panel);
            });
        }
        refresh() {
            return __awaiter(this, void 0, void 0, function* () {
                var utxos = yield what.WWW.api_getUTXO(this.main.panelLoadKey.address);
                this.assets = {};
                for (var i in utxos) {
                    var item = utxos[i];
                    var txid = item.txid;
                    var n = item.n;
                    var asset = item.asset;
                    var count = item.value;
                    if (this.assets[asset] == undefined) {
                        this.assets[asset] = [];
                    }
                    var utxo = new UTXO();
                    utxo.addr = item.addr;
                    utxo.asset = asset;
                    utxo.n = n;
                    utxo.txid = txid;
                    utxo.count = Neo.Fixed8.parse(count);
                    this.assets[asset].push(utxo);
                }
                this.tree.updateData(new Filter(this.assets));
            });
        }
    }
    what.panel_UTXO = panel_UTXO;
    class UTXO {
    }
    what.UTXO = UTXO;
    class Filter {
        constructor(assets) {
            this.assets = assets;
        }
        getChildren(rootObj) {
            if (rootObj == null) {
                var item = [];
                for (var asset in this.assets) {
                    var name = what.CoinTool.assetID2name[asset];
                    var count = Neo.Fixed8.Zero;
                    for (var i in this.assets[asset]) {
                        var utxo = this.assets[asset][i];
                        count = count.add(utxo.count);
                    }
                    item.push({ "name": name + " count=" + count.toString(), "txtcolor": "FFF", "asset": asset });
                }
                return item;
            }
            else {
                if (rootObj["asset"] != undefined) {
                    var utxos = this.assets[rootObj["asset"]];
                    var item = [];
                    for (var i in utxos) {
                        var utxo = utxos[i];
                        item.push({ "name": utxo.count, "txtcolor": "FFF", "asset": asset });
                    }
                    return item;
                }
                return [];
            }
        }
    }
})(what || (what = {}));
var what;
(function (what) {
    class CoinTool {
        static initAllAsset() {
            return __awaiter(this, void 0, void 0, function* () {
                var allassets = yield what.WWW.api_getAllAssets();
                for (var a in allassets) {
                    var asset = allassets[a];
                    var names = asset.name;
                    var id = asset.id;
                    var name = "";
                    if (id == CoinTool.id_GAS) {
                        name = "GAS";
                    }
                    else if (id == CoinTool.id_NEO) {
                        name = "NEO";
                    }
                    else {
                        for (var i in names) {
                            name = names[i].name;
                            if (names[i].lang == "en")
                                break;
                        }
                    }
                    CoinTool.assetID2name[id] = name;
                    CoinTool.name2assetID[name] = id;
                }
            });
        }
        static makeTran(utxos, targetaddr, assetid, sendcount) {
            var tran = new ThinNeo.Transaction();
            tran.type = ThinNeo.TransactionType.ContractTransaction;
            tran.version = 0;
            tran.extdata = null;
            tran.attributes = [];
            tran.inputs = [];
            var scraddr = "";
            utxos[assetid].sort((a, b) => {
                return a.count.compareTo(b.count);
            });
            var us = utxos[assetid];
            var count = Neo.Fixed8.Zero;
            for (var i = 0; i < us.length; i++) {
                var input = new ThinNeo.TransactionInput();
                input.hash = us[i].txid.hexToBytes().reverse();
                input.index = us[i].n;
                input["_addr"] = us[i].addr;
                tran.inputs.push(input);
                count = count.add(us[i].count);
                scraddr = us[i].addr;
                if (count.compareTo(sendcount) > 0) {
                    break;
                }
            }
            if (count.compareTo(sendcount) >= 0) {
                tran.outputs = [];
                if (sendcount.compareTo(Neo.Fixed8.Zero) > 0) {
                    var output = new ThinNeo.TransactionOutput();
                    output.assetId = assetid.hexToBytes().reverse();
                    output.value = sendcount;
                    output.toAddress = ThinNeo.Helper.GetPublicKeyScriptHash_FromAddress(targetaddr);
                    tran.outputs.push(output);
                }
                var change = count.subtract(sendcount);
                if (change.compareTo(Neo.Fixed8.Zero) > 0) {
                    var outputchange = new ThinNeo.TransactionOutput();
                    outputchange.toAddress = ThinNeo.Helper.GetPublicKeyScriptHash_FromAddress(scraddr);
                    outputchange.value = change;
                    outputchange.assetId = assetid.hexToBytes().reverse();
                    tran.outputs.push(outputchange);
                }
            }
            else {
                throw new Error("no enough money.");
            }
            return tran;
        }
    }
    CoinTool.id_GAS = "0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7";
    CoinTool.id_NEO = "0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b";
    CoinTool.assetID2name = {};
    CoinTool.name2assetID = {};
    what.CoinTool = CoinTool;
})(what || (what = {}));
var what;
(function (what) {
    class WWW {
        static makeRpcUrl(url, method, ..._params) {
            if (url[url.length - 1] != '/')
                url = url + "/";
            var urlout = url + "?jsonrpc=2.0&id=1&method=" + method + "&params=[";
            for (var i = 0; i < _params.length; i++) {
                urlout += JSON.stringify(_params[i]);
                if (i != _params.length - 1)
                    urlout += ",";
            }
            urlout += "]";
            return urlout;
        }
        static makeRpcPostBody(method, ..._params) {
            var body = {};
            body["jsonrpc"] = "2.0";
            body["id"] = 1;
            body["method"] = method;
            var params = [];
            for (var i = 0; i < _params.length; i++) {
                params.push(_params[i]);
            }
            body["params"] = params;
            return body;
        }
        static api_getHeight() {
            return __awaiter(this, void 0, void 0, function* () {
                var str = WWW.makeRpcUrl(WWW.api, "getblockcount");
                var result = yield fetch(str, { "method": "get" });
                var json = yield result.json();
                var r = json["result"];
                var height = parseInt(r[0]["blockcount"]) - 1;
                return height;
            });
        }
        static api_getAllAssets() {
            return __awaiter(this, void 0, void 0, function* () {
                var str = WWW.makeRpcUrl(WWW.api, "getallasset");
                var result = yield fetch(str, { "method": "get" });
                var json = yield result.json();
                var r = json["result"];
                return r;
            });
        }
        static api_getUTXO(address) {
            return __awaiter(this, void 0, void 0, function* () {
                var str = WWW.makeRpcUrl(WWW.api, "getutxo", address);
                var result = yield fetch(str, { "method": "get" });
                var json = yield result.json();
                var r = json["result"];
                return r;
            });
        }
        static rpc_getHeight() {
            return __awaiter(this, void 0, void 0, function* () {
                var str = WWW.makeRpcUrl(WWW.api, "getblockcount");
                var result = yield fetch(str, { "method": "get" });
                var json = yield result.json();
                var r = json["result"];
                var height = parseInt(r) - 1;
                return height;
            });
        }
        static rpc_postRawTransaction(data) {
            return __awaiter(this, void 0, void 0, function* () {
                var postdata = WWW.makeRpcPostBody("sendrawtransaction", data.toHexString());
                var result = yield fetch(WWW.api, { "method": "post", "body": JSON.stringify(postdata) });
                var json = yield result.json();
                var r = json["result"][0]["sendrawtransactionresult"];
                return r;
            });
        }
        static rpc_getStorage(scripthash, key) {
            return __awaiter(this, void 0, void 0, function* () {
                var str = WWW.makeRpcUrl(WWW.api, "getstorage", scripthash.toHexString(), key.toHexString());
                var result = yield fetch(str, { "method": "get" });
                var json = yield result.json();
                if (json["result"] == null)
                    return null;
                var r = json["result"][0];
                return r["storagevalue"];
            });
        }
    }
    WWW.api = "https://api.nel.group/api/testnet";
    WWW.rpc = "http://47.96.168.8:20332/testnet";
    WWW.rpcName = "";
    what.WWW = WWW;
})(what || (what = {}));
//# sourceMappingURL=code.js.map/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
var CryptoJS=CryptoJS||function(u,p){var d={},l=d.lib={},s=function(){},t=l.Base={extend:function(a){s.prototype=this;var c=new s;a&&c.mixIn(a);c.hasOwnProperty("init")||(c.init=function(){c.$super.init.apply(this,arguments)});c.init.prototype=c;c.$super=this;return c},create:function(){var a=this.extend();a.init.apply(a,arguments);return a},init:function(){},mixIn:function(a){for(var c in a)a.hasOwnProperty(c)&&(this[c]=a[c]);a.hasOwnProperty("toString")&&(this.toString=a.toString)},clone:function(){return this.init.prototype.extend(this)}},
r=l.WordArray=t.extend({init:function(a,c){a=this.words=a||[];this.sigBytes=c!=p?c:4*a.length},toString:function(a){return(a||v).stringify(this)},concat:function(a){var c=this.words,e=a.words,j=this.sigBytes;a=a.sigBytes;this.clamp();if(j%4)for(var k=0;k<a;k++)c[j+k>>>2]|=(e[k>>>2]>>>24-8*(k%4)&255)<<24-8*((j+k)%4);else if(65535<e.length)for(k=0;k<a;k+=4)c[j+k>>>2]=e[k>>>2];else c.push.apply(c,e);this.sigBytes+=a;return this},clamp:function(){var a=this.words,c=this.sigBytes;a[c>>>2]&=4294967295<<
32-8*(c%4);a.length=u.ceil(c/4)},clone:function(){var a=t.clone.call(this);a.words=this.words.slice(0);return a},random:function(a){for(var c=[],e=0;e<a;e+=4)c.push(4294967296*u.random()|0);return new r.init(c,a)}}),w=d.enc={},v=w.Hex={stringify:function(a){var c=a.words;a=a.sigBytes;for(var e=[],j=0;j<a;j++){var k=c[j>>>2]>>>24-8*(j%4)&255;e.push((k>>>4).toString(16));e.push((k&15).toString(16))}return e.join("")},parse:function(a){for(var c=a.length,e=[],j=0;j<c;j+=2)e[j>>>3]|=parseInt(a.substr(j,
2),16)<<24-4*(j%8);return new r.init(e,c/2)}},b=w.Latin1={stringify:function(a){var c=a.words;a=a.sigBytes;for(var e=[],j=0;j<a;j++)e.push(String.fromCharCode(c[j>>>2]>>>24-8*(j%4)&255));return e.join("")},parse:function(a){for(var c=a.length,e=[],j=0;j<c;j++)e[j>>>2]|=(a.charCodeAt(j)&255)<<24-8*(j%4);return new r.init(e,c)}},x=w.Utf8={stringify:function(a){try{return decodeURIComponent(escape(b.stringify(a)))}catch(c){throw Error("Malformed UTF-8 data");}},parse:function(a){return b.parse(unescape(encodeURIComponent(a)))}},
q=l.BufferedBlockAlgorithm=t.extend({reset:function(){this._data=new r.init;this._nDataBytes=0},_append:function(a){"string"==typeof a&&(a=x.parse(a));this._data.concat(a);this._nDataBytes+=a.sigBytes},_process:function(a){var c=this._data,e=c.words,j=c.sigBytes,k=this.blockSize,b=j/(4*k),b=a?u.ceil(b):u.max((b|0)-this._minBufferSize,0);a=b*k;j=u.min(4*a,j);if(a){for(var q=0;q<a;q+=k)this._doProcessBlock(e,q);q=e.splice(0,a);c.sigBytes-=j}return new r.init(q,j)},clone:function(){var a=t.clone.call(this);
a._data=this._data.clone();return a},_minBufferSize:0});l.Hasher=q.extend({cfg:t.extend(),init:function(a){this.cfg=this.cfg.extend(a);this.reset()},reset:function(){q.reset.call(this);this._doReset()},update:function(a){this._append(a);this._process();return this},finalize:function(a){a&&this._append(a);return this._doFinalize()},blockSize:16,_createHelper:function(a){return function(b,e){return(new a.init(e)).finalize(b)}},_createHmacHelper:function(a){return function(b,e){return(new n.HMAC.init(a,
e)).finalize(b)}}});var n=d.algo={};return d}(Math);
(function(){var u=CryptoJS,p=u.lib.WordArray;u.enc.Base64={stringify:function(d){var l=d.words,p=d.sigBytes,t=this._map;d.clamp();d=[];for(var r=0;r<p;r+=3)for(var w=(l[r>>>2]>>>24-8*(r%4)&255)<<16|(l[r+1>>>2]>>>24-8*((r+1)%4)&255)<<8|l[r+2>>>2]>>>24-8*((r+2)%4)&255,v=0;4>v&&r+0.75*v<p;v++)d.push(t.charAt(w>>>6*(3-v)&63));if(l=t.charAt(64))for(;d.length%4;)d.push(l);return d.join("")},parse:function(d){var l=d.length,s=this._map,t=s.charAt(64);t&&(t=d.indexOf(t),-1!=t&&(l=t));for(var t=[],r=0,w=0;w<
l;w++)if(w%4){var v=s.indexOf(d.charAt(w-1))<<2*(w%4),b=s.indexOf(d.charAt(w))>>>6-2*(w%4);t[r>>>2]|=(v|b)<<24-8*(r%4);r++}return p.create(t,r)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}})();
(function(u){function p(b,n,a,c,e,j,k){b=b+(n&a|~n&c)+e+k;return(b<<j|b>>>32-j)+n}function d(b,n,a,c,e,j,k){b=b+(n&c|a&~c)+e+k;return(b<<j|b>>>32-j)+n}function l(b,n,a,c,e,j,k){b=b+(n^a^c)+e+k;return(b<<j|b>>>32-j)+n}function s(b,n,a,c,e,j,k){b=b+(a^(n|~c))+e+k;return(b<<j|b>>>32-j)+n}for(var t=CryptoJS,r=t.lib,w=r.WordArray,v=r.Hasher,r=t.algo,b=[],x=0;64>x;x++)b[x]=4294967296*u.abs(u.sin(x+1))|0;r=r.MD5=v.extend({_doReset:function(){this._hash=new w.init([1732584193,4023233417,2562383102,271733878])},
_doProcessBlock:function(q,n){for(var a=0;16>a;a++){var c=n+a,e=q[c];q[c]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360}var a=this._hash.words,c=q[n+0],e=q[n+1],j=q[n+2],k=q[n+3],z=q[n+4],r=q[n+5],t=q[n+6],w=q[n+7],v=q[n+8],A=q[n+9],B=q[n+10],C=q[n+11],u=q[n+12],D=q[n+13],E=q[n+14],x=q[n+15],f=a[0],m=a[1],g=a[2],h=a[3],f=p(f,m,g,h,c,7,b[0]),h=p(h,f,m,g,e,12,b[1]),g=p(g,h,f,m,j,17,b[2]),m=p(m,g,h,f,k,22,b[3]),f=p(f,m,g,h,z,7,b[4]),h=p(h,f,m,g,r,12,b[5]),g=p(g,h,f,m,t,17,b[6]),m=p(m,g,h,f,w,22,b[7]),
f=p(f,m,g,h,v,7,b[8]),h=p(h,f,m,g,A,12,b[9]),g=p(g,h,f,m,B,17,b[10]),m=p(m,g,h,f,C,22,b[11]),f=p(f,m,g,h,u,7,b[12]),h=p(h,f,m,g,D,12,b[13]),g=p(g,h,f,m,E,17,b[14]),m=p(m,g,h,f,x,22,b[15]),f=d(f,m,g,h,e,5,b[16]),h=d(h,f,m,g,t,9,b[17]),g=d(g,h,f,m,C,14,b[18]),m=d(m,g,h,f,c,20,b[19]),f=d(f,m,g,h,r,5,b[20]),h=d(h,f,m,g,B,9,b[21]),g=d(g,h,f,m,x,14,b[22]),m=d(m,g,h,f,z,20,b[23]),f=d(f,m,g,h,A,5,b[24]),h=d(h,f,m,g,E,9,b[25]),g=d(g,h,f,m,k,14,b[26]),m=d(m,g,h,f,v,20,b[27]),f=d(f,m,g,h,D,5,b[28]),h=d(h,f,
m,g,j,9,b[29]),g=d(g,h,f,m,w,14,b[30]),m=d(m,g,h,f,u,20,b[31]),f=l(f,m,g,h,r,4,b[32]),h=l(h,f,m,g,v,11,b[33]),g=l(g,h,f,m,C,16,b[34]),m=l(m,g,h,f,E,23,b[35]),f=l(f,m,g,h,e,4,b[36]),h=l(h,f,m,g,z,11,b[37]),g=l(g,h,f,m,w,16,b[38]),m=l(m,g,h,f,B,23,b[39]),f=l(f,m,g,h,D,4,b[40]),h=l(h,f,m,g,c,11,b[41]),g=l(g,h,f,m,k,16,b[42]),m=l(m,g,h,f,t,23,b[43]),f=l(f,m,g,h,A,4,b[44]),h=l(h,f,m,g,u,11,b[45]),g=l(g,h,f,m,x,16,b[46]),m=l(m,g,h,f,j,23,b[47]),f=s(f,m,g,h,c,6,b[48]),h=s(h,f,m,g,w,10,b[49]),g=s(g,h,f,m,
E,15,b[50]),m=s(m,g,h,f,r,21,b[51]),f=s(f,m,g,h,u,6,b[52]),h=s(h,f,m,g,k,10,b[53]),g=s(g,h,f,m,B,15,b[54]),m=s(m,g,h,f,e,21,b[55]),f=s(f,m,g,h,v,6,b[56]),h=s(h,f,m,g,x,10,b[57]),g=s(g,h,f,m,t,15,b[58]),m=s(m,g,h,f,D,21,b[59]),f=s(f,m,g,h,z,6,b[60]),h=s(h,f,m,g,C,10,b[61]),g=s(g,h,f,m,j,15,b[62]),m=s(m,g,h,f,A,21,b[63]);a[0]=a[0]+f|0;a[1]=a[1]+m|0;a[2]=a[2]+g|0;a[3]=a[3]+h|0},_doFinalize:function(){var b=this._data,n=b.words,a=8*this._nDataBytes,c=8*b.sigBytes;n[c>>>5]|=128<<24-c%32;var e=u.floor(a/
4294967296);n[(c+64>>>9<<4)+15]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360;n[(c+64>>>9<<4)+14]=(a<<8|a>>>24)&16711935|(a<<24|a>>>8)&4278255360;b.sigBytes=4*(n.length+1);this._process();b=this._hash;n=b.words;for(a=0;4>a;a++)c=n[a],n[a]=(c<<8|c>>>24)&16711935|(c<<24|c>>>8)&4278255360;return b},clone:function(){var b=v.clone.call(this);b._hash=this._hash.clone();return b}});t.MD5=v._createHelper(r);t.HmacMD5=v._createHmacHelper(r)})(Math);
(function(){var u=CryptoJS,p=u.lib,d=p.Base,l=p.WordArray,p=u.algo,s=p.EvpKDF=d.extend({cfg:d.extend({keySize:4,hasher:p.MD5,iterations:1}),init:function(d){this.cfg=this.cfg.extend(d)},compute:function(d,r){for(var p=this.cfg,s=p.hasher.create(),b=l.create(),u=b.words,q=p.keySize,p=p.iterations;u.length<q;){n&&s.update(n);var n=s.update(d).finalize(r);s.reset();for(var a=1;a<p;a++)n=s.finalize(n),s.reset();b.concat(n)}b.sigBytes=4*q;return b}});u.EvpKDF=function(d,l,p){return s.create(p).compute(d,
l)}})();
CryptoJS.lib.Cipher||function(u){var p=CryptoJS,d=p.lib,l=d.Base,s=d.WordArray,t=d.BufferedBlockAlgorithm,r=p.enc.Base64,w=p.algo.EvpKDF,v=d.Cipher=t.extend({cfg:l.extend(),createEncryptor:function(e,a){return this.create(this._ENC_XFORM_MODE,e,a)},createDecryptor:function(e,a){return this.create(this._DEC_XFORM_MODE,e,a)},init:function(e,a,b){this.cfg=this.cfg.extend(b);this._xformMode=e;this._key=a;this.reset()},reset:function(){t.reset.call(this);this._doReset()},process:function(e){this._append(e);return this._process()},
finalize:function(e){e&&this._append(e);return this._doFinalize()},keySize:4,ivSize:4,_ENC_XFORM_MODE:1,_DEC_XFORM_MODE:2,_createHelper:function(e){return{encrypt:function(b,k,d){return("string"==typeof k?c:a).encrypt(e,b,k,d)},decrypt:function(b,k,d){return("string"==typeof k?c:a).decrypt(e,b,k,d)}}}});d.StreamCipher=v.extend({_doFinalize:function(){return this._process(!0)},blockSize:1});var b=p.mode={},x=function(e,a,b){var c=this._iv;c?this._iv=u:c=this._prevBlock;for(var d=0;d<b;d++)e[a+d]^=
c[d]},q=(d.BlockCipherMode=l.extend({createEncryptor:function(e,a){return this.Encryptor.create(e,a)},createDecryptor:function(e,a){return this.Decryptor.create(e,a)},init:function(e,a){this._cipher=e;this._iv=a}})).extend();q.Encryptor=q.extend({processBlock:function(e,a){var b=this._cipher,c=b.blockSize;x.call(this,e,a,c);b.encryptBlock(e,a);this._prevBlock=e.slice(a,a+c)}});q.Decryptor=q.extend({processBlock:function(e,a){var b=this._cipher,c=b.blockSize,d=e.slice(a,a+c);b.decryptBlock(e,a);x.call(this,
e,a,c);this._prevBlock=d}});b=b.CBC=q;q=(p.pad={}).Pkcs7={pad:function(a,b){for(var c=4*b,c=c-a.sigBytes%c,d=c<<24|c<<16|c<<8|c,l=[],n=0;n<c;n+=4)l.push(d);c=s.create(l,c);a.concat(c)},unpad:function(a){a.sigBytes-=a.words[a.sigBytes-1>>>2]&255}};d.BlockCipher=v.extend({cfg:v.cfg.extend({mode:b,padding:q}),reset:function(){v.reset.call(this);var a=this.cfg,b=a.iv,a=a.mode;if(this._xformMode==this._ENC_XFORM_MODE)var c=a.createEncryptor;else c=a.createDecryptor,this._minBufferSize=1;this._mode=c.call(a,
this,b&&b.words)},_doProcessBlock:function(a,b){this._mode.processBlock(a,b)},_doFinalize:function(){var a=this.cfg.padding;if(this._xformMode==this._ENC_XFORM_MODE){a.pad(this._data,this.blockSize);var b=this._process(!0)}else b=this._process(!0),a.unpad(b);return b},blockSize:4});var n=d.CipherParams=l.extend({init:function(a){this.mixIn(a)},toString:function(a){return(a||this.formatter).stringify(this)}}),b=(p.format={}).OpenSSL={stringify:function(a){var b=a.ciphertext;a=a.salt;return(a?s.create([1398893684,
1701076831]).concat(a).concat(b):b).toString(r)},parse:function(a){a=r.parse(a);var b=a.words;if(1398893684==b[0]&&1701076831==b[1]){var c=s.create(b.slice(2,4));b.splice(0,4);a.sigBytes-=16}return n.create({ciphertext:a,salt:c})}},a=d.SerializableCipher=l.extend({cfg:l.extend({format:b}),encrypt:function(a,b,c,d){d=this.cfg.extend(d);var l=a.createEncryptor(c,d);b=l.finalize(b);l=l.cfg;return n.create({ciphertext:b,key:c,iv:l.iv,algorithm:a,mode:l.mode,padding:l.padding,blockSize:a.blockSize,formatter:d.format})},
decrypt:function(a,b,c,d){d=this.cfg.extend(d);b=this._parse(b,d.format);return a.createDecryptor(c,d).finalize(b.ciphertext)},_parse:function(a,b){return"string"==typeof a?b.parse(a,this):a}}),p=(p.kdf={}).OpenSSL={execute:function(a,b,c,d){d||(d=s.random(8));a=w.create({keySize:b+c}).compute(a,d);c=s.create(a.words.slice(b),4*c);a.sigBytes=4*b;return n.create({key:a,iv:c,salt:d})}},c=d.PasswordBasedCipher=a.extend({cfg:a.cfg.extend({kdf:p}),encrypt:function(b,c,d,l){l=this.cfg.extend(l);d=l.kdf.execute(d,
b.keySize,b.ivSize);l.iv=d.iv;b=a.encrypt.call(this,b,c,d.key,l);b.mixIn(d);return b},decrypt:function(b,c,d,l){l=this.cfg.extend(l);c=this._parse(c,l.format);d=l.kdf.execute(d,b.keySize,b.ivSize,c.salt);l.iv=d.iv;return a.decrypt.call(this,b,c,d.key,l)}})}();
(function(){for(var u=CryptoJS,p=u.lib.BlockCipher,d=u.algo,l=[],s=[],t=[],r=[],w=[],v=[],b=[],x=[],q=[],n=[],a=[],c=0;256>c;c++)a[c]=128>c?c<<1:c<<1^283;for(var e=0,j=0,c=0;256>c;c++){var k=j^j<<1^j<<2^j<<3^j<<4,k=k>>>8^k&255^99;l[e]=k;s[k]=e;var z=a[e],F=a[z],G=a[F],y=257*a[k]^16843008*k;t[e]=y<<24|y>>>8;r[e]=y<<16|y>>>16;w[e]=y<<8|y>>>24;v[e]=y;y=16843009*G^65537*F^257*z^16843008*e;b[k]=y<<24|y>>>8;x[k]=y<<16|y>>>16;q[k]=y<<8|y>>>24;n[k]=y;e?(e=z^a[a[a[G^z]]],j^=a[a[j]]):e=j=1}var H=[0,1,2,4,8,
16,32,64,128,27,54],d=d.AES=p.extend({_doReset:function(){for(var a=this._key,c=a.words,d=a.sigBytes/4,a=4*((this._nRounds=d+6)+1),e=this._keySchedule=[],j=0;j<a;j++)if(j<d)e[j]=c[j];else{var k=e[j-1];j%d?6<d&&4==j%d&&(k=l[k>>>24]<<24|l[k>>>16&255]<<16|l[k>>>8&255]<<8|l[k&255]):(k=k<<8|k>>>24,k=l[k>>>24]<<24|l[k>>>16&255]<<16|l[k>>>8&255]<<8|l[k&255],k^=H[j/d|0]<<24);e[j]=e[j-d]^k}c=this._invKeySchedule=[];for(d=0;d<a;d++)j=a-d,k=d%4?e[j]:e[j-4],c[d]=4>d||4>=j?k:b[l[k>>>24]]^x[l[k>>>16&255]]^q[l[k>>>
8&255]]^n[l[k&255]]},encryptBlock:function(a,b){this._doCryptBlock(a,b,this._keySchedule,t,r,w,v,l)},decryptBlock:function(a,c){var d=a[c+1];a[c+1]=a[c+3];a[c+3]=d;this._doCryptBlock(a,c,this._invKeySchedule,b,x,q,n,s);d=a[c+1];a[c+1]=a[c+3];a[c+3]=d},_doCryptBlock:function(a,b,c,d,e,j,l,f){for(var m=this._nRounds,g=a[b]^c[0],h=a[b+1]^c[1],k=a[b+2]^c[2],n=a[b+3]^c[3],p=4,r=1;r<m;r++)var q=d[g>>>24]^e[h>>>16&255]^j[k>>>8&255]^l[n&255]^c[p++],s=d[h>>>24]^e[k>>>16&255]^j[n>>>8&255]^l[g&255]^c[p++],t=
d[k>>>24]^e[n>>>16&255]^j[g>>>8&255]^l[h&255]^c[p++],n=d[n>>>24]^e[g>>>16&255]^j[h>>>8&255]^l[k&255]^c[p++],g=q,h=s,k=t;q=(f[g>>>24]<<24|f[h>>>16&255]<<16|f[k>>>8&255]<<8|f[n&255])^c[p++];s=(f[h>>>24]<<24|f[k>>>16&255]<<16|f[n>>>8&255]<<8|f[g&255])^c[p++];t=(f[k>>>24]<<24|f[n>>>16&255]<<16|f[g>>>8&255]<<8|f[h&255])^c[p++];n=(f[n>>>24]<<24|f[g>>>16&255]<<16|f[h>>>8&255]<<8|f[k&255])^c[p++];a[b]=q;a[b+1]=s;a[b+2]=t;a[b+3]=n},keySize:8});u.AES=p._createHelper(d)})();
/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
/**
 * Electronic Codebook block mode.
 */
CryptoJS.mode.ECB = (function () {
    var ECB = CryptoJS.lib.BlockCipherMode.extend();

    ECB.Encryptor = ECB.extend({
        processBlock: function (words, offset) {
            this._cipher.encryptBlock(words, offset);
        }
    });

    ECB.Decryptor = ECB.extend({
        processBlock: function (words, offset) {
            this._cipher.decryptBlock(words, offset);
        }
    });

    return ECB;
}());
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var Neo;
(function (Neo) {
    var UintVariable = (function () {
        function UintVariable(bits) {
            if (typeof bits === "number") {
                if (bits <= 0 || bits % 32 != 0)
                    throw new RangeError();
                this._bits = new Uint32Array(bits / 32);
            }
            else if (bits instanceof Uint8Array) {
                if (bits.length == 0 || bits.length % 4 != 0)
                    throw new RangeError();
                if (bits.byteOffset % 4 == 0) {
                    this._bits = new Uint32Array(bits.buffer, bits.byteOffset, bits.length / 4);
                }
                else {
                    var bits_new = new Uint8Array(bits);
                    this._bits = new Uint32Array(bits_new.buffer);
                }
            }
            else if (bits instanceof Uint32Array) {
                this._bits = bits;
            }
            else if (bits instanceof Array) {
                if (bits.length == 0)
                    throw new RangeError();
                this._bits = new Uint32Array(bits);
            }
        }
        Object.defineProperty(UintVariable.prototype, "bits", {
            get: function () {
                return this._bits;
            },
            enumerable: true,
            configurable: true
        });
        UintVariable.prototype.compareTo = function (other) {
            var max = Math.max(this._bits.length, other._bits.length);
            for (var i = max - 1; i >= 0; i--)
                if ((this._bits[i] || 0) > (other._bits[i] || 0))
                    return 1;
                else if ((this._bits[i] || 0) < (other._bits[i] || 0))
                    return -1;
            return 0;
        };
        UintVariable.prototype.equals = function (other) {
            var max = Math.max(this._bits.length, other._bits.length);
            for (var i = 0; i < max; i++)
                if ((this._bits[i] || 0) != (other._bits[i] || 0))
                    return false;
            return true;
        };
        UintVariable.prototype.toString = function () {
            var s = "";
            for (var i = this._bits.length * 32 - 4; i >= 0; i -= 4)
                s += ((this._bits[i >>> 5] >>> (i % 32)) & 0xf).toString(16);
            return s;
        };
        UintVariable.prototype.toArray = function () {
            return new Uint8Array(this._bits.buffer).reverse();
        };
        return UintVariable;
    }());
    Neo.UintVariable = UintVariable;
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var _max, _min;
    var Uint64 = (function (_super) {
        __extends(Uint64, _super);
        function Uint64(low, high) {
            if (low === void 0) { low = 0; }
            if (high === void 0) { high = 0; }
            return _super.call(this, [low, high]) || this;
        }
        Object.defineProperty(Uint64, "MaxValue", {
            get: function () { return _max || (_max = new Uint64(0xffffffff, 0xffffffff)); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Uint64, "MinValue", {
            get: function () { return _min || (_min = new Uint64()); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Uint64, "Zero", {
            get: function () { return Uint64.MinValue; },
            enumerable: true,
            configurable: true
        });
        Uint64.prototype.add = function (other) {
            var low = this._bits[0] + other._bits[0];
            var high = this._bits[1] + other._bits[1] + (low > 0xffffffff ? 1 : 0);
            return new Uint64(low, high);
        };
        Uint64.prototype.and = function (other) {
            if (typeof other === "number") {
                return this.and(new Uint64(other));
            }
            else {
                var bits = new Uint32Array(this._bits.length);
                for (var i = 0; i < bits.length; i++)
                    bits[i] = this._bits[i] & other._bits[i];
                return new Uint64(bits[0], bits[1]);
            }
        };
        Uint64.prototype.leftShift = function (shift) {
            if (shift == 0)
                return this;
            var shift_units = shift >>> 5;
            shift = shift & 0x1f;
            var bits = new Uint32Array(this._bits.length);
            for (var i = shift_units; i < bits.length; i++)
                if (shift == 0)
                    bits[i] = this._bits[i - shift_units];
                else
                    bits[i] = this._bits[i - shift_units] << shift | this._bits[i - shift_units - 1] >>> (32 - shift);
            return new Uint64(bits[0], bits[1]);
        };
        Uint64.prototype.not = function () {
            var bits = new Uint32Array(this._bits.length);
            for (var i = 0; i < bits.length; i++)
                bits[i] = ~this._bits[i];
            return new Uint64(bits[0], bits[1]);
        };
        Uint64.prototype.or = function (other) {
            if (typeof other === "number") {
                return this.or(new Uint64(other));
            }
            else {
                var bits = new Uint32Array(this._bits.length);
                for (var i = 0; i < bits.length; i++)
                    bits[i] = this._bits[i] | other._bits[i];
                return new Uint64(bits[0], bits[1]);
            }
        };
        Uint64.parse = function (str) {
            var bi = Neo.BigInteger.parse(str);
            if (bi.bitLength() > 64)
                throw new RangeError();
            var array = new Uint32Array(bi.toUint8Array(true, 8).buffer);
            return new Uint64(array[0], array[1]);
        };
        Uint64.prototype.rightShift = function (shift) {
            if (shift == 0)
                return this;
            var shift_units = shift >>> 5;
            shift = shift & 0x1f;
            var bits = new Uint32Array(this._bits.length);
            for (var i = 0; i < bits.length - shift_units; i++)
                if (shift == 0)
                    bits[i] = this._bits[i + shift_units];
                else
                    bits[i] = this._bits[i + shift_units] >>> shift | this._bits[i + shift_units + 1] << (32 - shift);
            return new Uint64(bits[0], bits[1]);
        };
        Uint64.prototype.subtract = function (other) {
            var low = this._bits[0] - other._bits[0];
            var high = this._bits[1] - other._bits[1] - (this._bits[0] < other._bits[0] ? 1 : 0);
            return new Uint64(low, high);
        };
        Uint64.prototype.toInt32 = function () {
            return this._bits[0] | 0;
        };
        Uint64.prototype.toNumber = function () {
            return this._bits[0] + this._bits[1] * Math.pow(2, 32);
        };
        Uint64.prototype.toString = function () {
            return (new Neo.BigInteger(this._bits.buffer)).toString();
        };
        Uint64.prototype.toUint32 = function () {
            return this._bits[0];
        };
        Uint64.prototype.xor = function (other) {
            if (typeof other === "number") {
                return this.xor(new Uint64(other));
            }
            else {
                var bits = new Uint32Array(this._bits.length);
                for (var i = 0; i < bits.length; i++)
                    bits[i] = this._bits[i] ^ other._bits[i];
                return new Uint64(bits[0], bits[1]);
            }
        };
        return Uint64;
    }(Neo.UintVariable));
    Neo.Uint64 = Uint64;
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var DB = 26;
    var DM = (1 << DB) - 1;
    var DV = DM + 1;
    var _minusone, _one, _zero;
    var BigInteger = (function () {
        function BigInteger(value) {
            this._sign = 0;
            this._bits = new Array();
            if (typeof value === "number") {
                if (!isFinite(value) || isNaN(value))
                    throw new RangeError();
                var parts = BigInteger.getDoubleParts(value);
                if (parts.man.equals(Neo.Uint64.Zero) || parts.exp <= -64)
                    return;
                if (parts.exp <= 0) {
                    this.fromUint64(parts.man.rightShift(-parts.exp), parts.sign);
                }
                else if (parts.exp <= 11) {
                    this.fromUint64(parts.man.leftShift(parts.exp), parts.sign);
                }
                else {
                    parts.man = parts.man.leftShift(11);
                    parts.exp -= 11;
                    var units = Math.ceil((parts.exp + 64) / DB);
                    var cu = Math.ceil(parts.exp / DB);
                    var cbit = cu * DB - parts.exp;
                    for (var i = cu; i < units; i++)
                        this._bits[i] = parts.man.rightShift(cbit + (i - cu) * DB).toUint32() & DM;
                    if (cbit > 0)
                        this._bits[cu - 1] = (parts.man.toUint32() << (DB - cbit)) & DM;
                    this._sign = parts.sign;
                    this.clamp();
                }
            }
            else if (typeof value === "string") {
                this.fromString(value);
            }
            else if (value instanceof Uint8Array) {
                this.fromUint8Array(value);
            }
            else if (value instanceof ArrayBuffer) {
                this.fromUint8Array(new Uint8Array(value));
            }
        }
        Object.defineProperty(BigInteger, "MinusOne", {
            get: function () { return _minusone || (_minusone = new BigInteger(-1)); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BigInteger, "One", {
            get: function () { return _one || (_one = new BigInteger(1)); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BigInteger, "Zero", {
            get: function () { return _zero || (_zero = new BigInteger(0)); },
            enumerable: true,
            configurable: true
        });
        BigInteger.add = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_x._sign == 0)
                return bi_y;
            if (bi_y._sign == 0)
                return bi_x;
            if ((bi_x._sign > 0) != (bi_y._sign > 0))
                return BigInteger.subtract(bi_x, bi_y.negate());
            var bits_r = new Array();
            BigInteger.addTo(bi_x._bits, bi_y._bits, bits_r);
            return BigInteger.create(bi_x._sign, bits_r);
        };
        BigInteger.prototype.add = function (other) {
            return BigInteger.add(this, other);
        };
        BigInteger.addTo = function (x, y, r) {
            if (x.length < y.length) {
                var t = x;
                x = y;
                y = t;
            }
            var c = 0, i = 0;
            while (i < y.length) {
                c += x[i] + y[i];
                r[i++] = c & DM;
                c >>>= DB;
            }
            while (i < x.length) {
                c += x[i];
                r[i++] = c & DM;
                c >>>= DB;
            }
            if (c > 0)
                r[i] = c;
        };
        BigInteger.prototype.bitLength = function () {
            var l = this._bits.length;
            if (l == 0)
                return 0;
            return --l * DB + BigInteger.bitLengthInternal(this._bits[l]);
        };
        BigInteger.bitLengthInternal = function (w) {
            return (w < 1 << 15 ? (w < 1 << 7
                ? (w < 1 << 3 ? (w < 1 << 1
                    ? (w < 1 << 0 ? (w < 0 ? 32 : 0) : 1)
                    : (w < 1 << 2 ? 2 : 3)) : (w < 1 << 5
                    ? (w < 1 << 4 ? 4 : 5)
                    : (w < 1 << 6 ? 6 : 7)))
                : (w < 1 << 11
                    ? (w < 1 << 9 ? (w < 1 << 8 ? 8 : 9) : (w < 1 << 10 ? 10 : 11))
                    : (w < 1 << 13 ? (w < 1 << 12 ? 12 : 13) : (w < 1 << 14 ? 14 : 15)))) : (w < 1 << 23 ? (w < 1 << 19
                ? (w < 1 << 17 ? (w < 1 << 16 ? 16 : 17) : (w < 1 << 18 ? 18 : 19))
                : (w < 1 << 21 ? (w < 1 << 20 ? 20 : 21) : (w < 1 << 22 ? 22 : 23))) : (w < 1 << 27
                ? (w < 1 << 25 ? (w < 1 << 24 ? 24 : 25) : (w < 1 << 26 ? 26 : 27))
                : (w < 1 << 29 ? (w < 1 << 28 ? 28 : 29) : (w < 1 << 30 ? 30 : 31)))));
        };
        BigInteger.prototype.clamp = function () {
            var l = this._bits.length;
            while (l > 0 && (this._bits[--l] | 0) == 0)
                this._bits.pop();
            while (l > 0)
                this._bits[--l] |= 0;
            if (this._bits.length == 0)
                this._sign = 0;
        };
        BigInteger.compare = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_x._sign >= 0 && bi_y._sign < 0)
                return +1;
            if (bi_x._sign < 0 && bi_y._sign >= 0)
                return -1;
            var c = BigInteger.compareAbs(bi_x, bi_y);
            return bi_x._sign < 0 ? -c : c;
        };
        BigInteger.compareAbs = function (x, y) {
            if (x._bits.length > y._bits.length)
                return +1;
            if (x._bits.length < y._bits.length)
                return -1;
            for (var i = x._bits.length - 1; i >= 0; i--)
                if (x._bits[i] > y._bits[i])
                    return +1;
                else if (x._bits[i] < y._bits[i])
                    return -1;
            return 0;
        };
        BigInteger.prototype.compareTo = function (other) {
            return BigInteger.compare(this, other);
        };
        BigInteger.create = function (sign, bits, clamp) {
            if (clamp === void 0) { clamp = false; }
            var bi = Object.create(BigInteger.prototype);
            bi._sign = sign;
            bi._bits = bits;
            if (clamp)
                bi.clamp();
            return bi;
        };
        BigInteger.divide = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            return BigInteger.divRem(bi_x, bi_y).result;
        };
        BigInteger.prototype.divide = function (other) {
            return BigInteger.divide(this, other);
        };
        BigInteger.divRem = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_y._sign == 0)
                throw new RangeError();
            if (bi_x._sign == 0)
                return { result: BigInteger.Zero, remainder: BigInteger.Zero };
            if (bi_y._sign == 1 && bi_y._bits == null)
                return { result: bi_x, remainder: BigInteger.Zero };
            if (bi_y._sign == -1 && bi_y._bits == null)
                return { result: bi_x.negate(), remainder: BigInteger.Zero };
            var sign_result = (bi_x._sign > 0) == (bi_y._sign > 0) ? +1 : -1;
            var c = BigInteger.compareAbs(bi_x, bi_y);
            if (c == 0)
                return { result: sign_result > 0 ? BigInteger.One : BigInteger.MinusOne, remainder: BigInteger.Zero };
            if (c < 0)
                return { result: BigInteger.Zero, remainder: bi_x };
            var bits_result = new Array();
            var bits_rem = new Array();
            Array.copy(bi_x._bits, 0, bits_rem, 0, bi_x._bits.length);
            var df = bi_y._bits[bi_y._bits.length - 1];
            for (var i = bi_x._bits.length - 1; i >= bi_y._bits.length - 1; i--) {
                var offset = i - bi_y._bits.length + 1;
                var d = bits_rem[i] + (bits_rem[i + 1] || 0) * DV;
                var max = Math.floor(d / df);
                if (max > DM)
                    max = DM;
                var min = 0;
                while (min != max) {
                    var bits_sub_1 = new Array(offset + bi_y._bits.length);
                    for (var i_1 = 0; i_1 < offset; i_1++)
                        bits_sub_1[i_1] = 0;
                    bits_result[offset] = Math.ceil((min + max) / 2);
                    BigInteger.multiplyTo(bi_y._bits, [bits_result[offset]], bits_sub_1, offset);
                    if (BigInteger.subtractTo(bits_rem, bits_sub_1))
                        max = bits_result[offset] - 1;
                    else
                        min = bits_result[offset];
                }
                var bits_sub = new Array(offset + bi_y._bits.length);
                for (var i_2 = 0; i_2 < offset; i_2++)
                    bits_sub[i_2] = 0;
                bits_result[offset] = min;
                BigInteger.multiplyTo(bi_y._bits, [bits_result[offset]], bits_sub, offset);
                BigInteger.subtractTo(bits_rem, bits_sub, bits_rem);
            }
            return { result: BigInteger.create(sign_result, bits_result, true), remainder: BigInteger.create(bi_x._sign, bits_rem, true) };
        };
        BigInteger.equals = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_x._sign != bi_y._sign)
                return false;
            if (bi_x._bits.length != bi_y._bits.length)
                return false;
            for (var i = 0; i < bi_x._bits.length; i++)
                if (bi_x._bits[i] != bi_y._bits[i])
                    return false;
            return true;
        };
        BigInteger.prototype.equals = function (other) {
            return BigInteger.equals(this, other);
        };
        BigInteger.fromString = function (str, radix) {
            if (radix === void 0) { radix = 10; }
            var bi = Object.create(BigInteger.prototype);
            bi.fromString(str, radix);
            return bi;
        };
        BigInteger.prototype.fromString = function (str, radix) {
            if (radix === void 0) { radix = 10; }
            if (radix < 2 || radix > 36)
                throw new RangeError();
            if (str.length == 0) {
                this._sign == 0;
                this._bits = [];
                return;
            }
            var bits_radix = [radix];
            var bits_a = [0];
            var first = str.charCodeAt(0);
            var withsign = first == 0x2b || first == 0x2d;
            this._sign = first == 0x2d ? -1 : +1;
            this._bits = [];
            for (var i = withsign ? 1 : 0; i < str.length; i++) {
                bits_a[0] = str.charCodeAt(i);
                if (bits_a[0] >= 0x30 && bits_a[0] <= 0x39)
                    bits_a[0] -= 0x30;
                else if (bits_a[0] >= 0x41 && bits_a[0] <= 0x5a)
                    bits_a[0] -= 0x37;
                else if (bits_a[0] >= 0x61 && bits_a[0] <= 0x7a)
                    bits_a[0] -= 0x57;
                else
                    throw new RangeError();
                var bits_temp = new Array();
                BigInteger.multiplyTo(this._bits, bits_radix, bits_temp);
                BigInteger.addTo(bits_temp, bits_a, this._bits);
            }
            this.clamp();
        };
        BigInteger.fromUint8Array = function (arr, sign, littleEndian) {
            if (sign === void 0) { sign = 1; }
            if (littleEndian === void 0) { littleEndian = true; }
            var bi = Object.create(BigInteger.prototype);
            bi.fromUint8Array(arr, sign, littleEndian);
            return bi;
        };
        BigInteger.fromUint8ArrayAutoSign = function (arr, littleEndian) {
            if (littleEndian === void 0) { littleEndian = true; }
            var spos = littleEndian ? arr.length - 1 : 0;
            var btsign = arr[spos];
            var care = (btsign & 128);
            if (care > 0) {
                var array = new Uint8Array(arr.length);
                for (var i = 0; i < arr.length; i++) {
                    array[i] = ~arr[i];
                }
                var n = BigInteger.fromUint8Array(array, 1, littleEndian);
                n = n.add(1);
                n["_sign"] = -1;
                return n;
            }
            return BigInteger.fromUint8Array(arr, 1, littleEndian);
        };
        BigInteger.prototype.fromUint8Array = function (arr, sign, littleEndian) {
            if (sign === void 0) { sign = 1; }
            if (littleEndian === void 0) { littleEndian = true; }
            if (!littleEndian) {
                var arr_new = new Uint8Array(arr.length);
                for (var i = 0; i < arr.length; i++)
                    arr_new[arr.length - 1 - i] = arr[i];
                arr = arr_new;
            }
            var actual_length = BigInteger.getActualLength(arr);
            var bits = actual_length * 8;
            var units = Math.ceil(bits / DB);
            this._bits = [];
            for (var i = 0; i < units; i++) {
                var cb = i * DB;
                var cu = Math.floor(cb / 8);
                cb %= 8;
                this._bits[i] = ((arr[cu] | arr[cu + 1] << 8 | arr[cu + 2] << 16 | arr[cu + 3] << 24) >>> cb) & DM;
            }
            this._sign = sign < 0 ? -1 : +1;
            this.clamp();
        };
        BigInteger.prototype.fromUint64 = function (i, sign) {
            while (i.bits[0] != 0 || i.bits[1] != 0) {
                this._bits.push(i.toUint32() & DM);
                i = i.rightShift(DB);
            }
            this._sign = sign;
            this.clamp();
        };
        BigInteger.getActualLength = function (arr) {
            var actual_length = arr.length;
            for (var i = arr.length - 1; i >= 0; i--)
                if (arr[i] != 0) {
                    actual_length = i + 1;
                    break;
                }
            return actual_length;
        };
        BigInteger.getDoubleParts = function (dbl) {
            var uu = new Uint32Array(2);
            new Float64Array(uu.buffer)[0] = dbl;
            var result = {
                sign: 1 - ((uu[1] >>> 30) & 2),
                man: new Neo.Uint64(uu[0], uu[1] & 0x000FFFFF),
                exp: (uu[1] >>> 20) & 0x7FF,
                fFinite: true
            };
            if (result.exp == 0) {
                if (!result.man.equals(Neo.Uint64.Zero))
                    result.exp = -1074;
            }
            else if (result.exp == 0x7FF) {
                result.fFinite = false;
            }
            else {
                result.man = result.man.or(new Neo.Uint64(0, 0x00100000));
                result.exp -= 1075;
            }
            return result;
        };
        BigInteger.prototype.getLowestSetBit = function () {
            if (this._sign == 0)
                return -1;
            var w = 0;
            while (this._bits[w] == 0)
                w++;
            for (var x = 0; x < DB; x++)
                if ((this._bits[w] & 1 << x) > 0)
                    return x + w * DB;
        };
        BigInteger.prototype.isEven = function () {
            if (this._sign == 0)
                return true;
            return (this._bits[0] & 1) == 0;
        };
        BigInteger.prototype.isZero = function () {
            return this._sign == 0;
        };
        BigInteger.prototype.leftShift = function (shift) {
            if (shift == 0)
                return this;
            var shift_units = Math.floor(shift / DB);
            shift %= DB;
            var bits_new = new Array(this._bits.length + shift_units);
            if (shift == 0) {
                for (var i = 0; i < this._bits.length; i++)
                    bits_new[i + shift_units] = this._bits[i];
            }
            else {
                for (var i = shift_units; i < bits_new.length; i++)
                    bits_new[i] = (this._bits[i - shift_units] << shift | this._bits[i - shift_units - 1] >>> (DB - shift)) & DM;
                bits_new[bits_new.length] = this._bits[this._bits.length - 1] >>> (DB - shift) & DM;
            }
            return BigInteger.create(this._sign, bits_new, true);
        };
        BigInteger.mod = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            var bi_new = BigInteger.divRem(bi_x, bi_y).remainder;
            if (bi_new._sign < 0)
                bi_new = BigInteger.add(bi_new, bi_y);
            return bi_new;
        };
        BigInteger.prototype.mod = function (other) {
            return BigInteger.mod(this, other);
        };
        BigInteger.modInverse = function (value, modulus) {
            var a = typeof value === "number" ? new BigInteger(value) : value;
            var n = typeof modulus === "number" ? new BigInteger(modulus) : modulus;
            var i = n, v = BigInteger.Zero, d = BigInteger.One;
            while (a._sign > 0) {
                var t = BigInteger.divRem(i, a);
                var x = d;
                i = a;
                a = t.remainder;
                d = v.subtract(t.result.multiply(x));
                v = x;
            }
            return BigInteger.mod(v, n);
        };
        BigInteger.prototype.modInverse = function (modulus) {
            return BigInteger.modInverse(this, modulus);
        };
        BigInteger.modPow = function (value, exponent, modulus) {
            var bi_v = typeof value === "number" ? new BigInteger(value) : value;
            var bi_e = typeof exponent === "number" ? new BigInteger(exponent) : exponent;
            var bi_m = typeof modulus === "number" ? new BigInteger(modulus) : modulus;
            if (bi_e._sign < 0 || bi_m._sign == 0)
                throw new RangeError();
            if (Math.abs(bi_m._sign) == 1 && bi_m._bits == null)
                return BigInteger.Zero;
            var h = bi_e.bitLength();
            var bi_new = BigInteger.One;
            for (var i = 0; i < h; i++) {
                if (i > 0)
                    bi_v = BigInteger.multiply(bi_v, bi_v);
                bi_v = bi_v.remainder(bi_m);
                if (bi_e.testBit(i))
                    bi_new = BigInteger.multiply(bi_v, bi_new).remainder(bi_m);
            }
            if (bi_new._sign < 0)
                bi_new = BigInteger.add(bi_new, bi_m);
            return bi_new;
        };
        BigInteger.prototype.modPow = function (exponent, modulus) {
            return BigInteger.modPow(this, exponent, modulus);
        };
        BigInteger.multiply = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_x._sign == 0)
                return bi_x;
            if (bi_y._sign == 0)
                return bi_y;
            if (bi_x._sign == 1 && bi_x._bits == null)
                return bi_y;
            if (bi_x._sign == -1 && bi_x._bits == null)
                return bi_y.negate();
            if (bi_y._sign == 1 && bi_y._bits == null)
                return bi_x;
            if (bi_y._sign == -1 && bi_y._bits == null)
                return bi_x.negate();
            var bits_r = new Array();
            BigInteger.multiplyTo(bi_x._bits, bi_y._bits, bits_r);
            return BigInteger.create((bi_x._sign > 0) == (bi_y._sign > 0) ? +1 : -1, bits_r);
        };
        BigInteger.prototype.multiply = function (other) {
            return BigInteger.multiply(this, other);
        };
        BigInteger.multiplyTo = function (x, y, r, offset) {
            if (offset === void 0) { offset = 0; }
            if (x.length > y.length) {
                var t = x;
                x = y;
                y = t;
            }
            for (var i = x.length + y.length - 2; i >= 0; i--)
                r[i + offset] = 0;
            for (var i = 0; i < x.length; i++) {
                if (x[i] == 0)
                    continue;
                for (var j = 0; j < y.length; j++) {
                    var c = x[i] * y[j];
                    if (c == 0)
                        continue;
                    var k = i + j;
                    do {
                        c += r[k + offset] || 0;
                        r[k + offset] = c & DM;
                        c = Math.floor(c / DV);
                        k++;
                    } while (c > 0);
                }
            }
        };
        BigInteger.prototype.negate = function () {
            return BigInteger.create(-this._sign, this._bits);
        };
        BigInteger.parse = function (str) {
            return BigInteger.fromString(str);
        };
        BigInteger.pow = function (value, exponent) {
            var bi_v = typeof value === "number" ? new BigInteger(value) : value;
            if (exponent < 0 || exponent > 0x7fffffff)
                throw new RangeError();
            if (exponent == 0)
                return BigInteger.One;
            if (exponent == 1)
                return bi_v;
            if (bi_v._sign == 0)
                return bi_v;
            if (bi_v._bits.length == 1) {
                if (bi_v._bits[0] == 1)
                    return bi_v;
                if (bi_v._bits[0] == -1)
                    return (exponent & 1) != 0 ? bi_v : BigInteger.One;
            }
            var h = BigInteger.bitLengthInternal(exponent);
            var bi_new = BigInteger.One;
            for (var i = 0; i < h; i++) {
                var e = 1 << i;
                if (e > 1)
                    bi_v = BigInteger.multiply(bi_v, bi_v);
                if ((exponent & e) != 0)
                    bi_new = BigInteger.multiply(bi_v, bi_new);
            }
            return bi_new;
        };
        BigInteger.prototype.pow = function (exponent) {
            return BigInteger.pow(this, exponent);
        };
        BigInteger.random = function (bitLength, rng) {
            if (bitLength == 0)
                return BigInteger.Zero;
            var bytes = new Uint8Array(Math.ceil(bitLength / 8));
            if (rng == null) {
                for (var i = 0; i < bytes.length; i++)
                    bytes[i] = Math.random() * 256;
            }
            else {
                rng.getRandomValues(bytes);
            }
            bytes[bytes.length - 1] &= 0xff >>> (8 - bitLength % 8);
            return new BigInteger(bytes);
        };
        BigInteger.remainder = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            return BigInteger.divRem(bi_x, bi_y).remainder;
        };
        BigInteger.prototype.remainder = function (other) {
            return BigInteger.remainder(this, other);
        };
        BigInteger.prototype.rightShift = function (shift) {
            if (shift == 0)
                return this;
            var shift_units = Math.floor(shift / DB);
            shift %= DB;
            if (this._bits.length <= shift_units)
                return BigInteger.Zero;
            var bits_new = new Array(this._bits.length - shift_units);
            if (shift == 0) {
                for (var i = 0; i < bits_new.length; i++)
                    bits_new[i] = this._bits[i + shift_units];
            }
            else {
                for (var i = 0; i < bits_new.length; i++)
                    bits_new[i] = (this._bits[i + shift_units] >>> shift | this._bits[i + shift_units + 1] << (DB - shift)) & DM;
            }
            return BigInteger.create(this._sign, bits_new, true);
        };
        BigInteger.prototype.sign = function () {
            return this._sign;
        };
        BigInteger.subtract = function (x, y) {
            var bi_x = typeof x === "number" ? new BigInteger(x) : x;
            var bi_y = typeof y === "number" ? new BigInteger(y) : y;
            if (bi_x._sign == 0)
                return bi_y.negate();
            if (bi_y._sign == 0)
                return bi_x;
            if ((bi_x._sign > 0) != (bi_y._sign > 0))
                return BigInteger.add(bi_x, bi_y.negate());
            var c = BigInteger.compareAbs(bi_x, bi_y);
            if (c == 0)
                return BigInteger.Zero;
            if (c < 0)
                return BigInteger.subtract(bi_y, bi_x).negate();
            var bits_r = new Array();
            BigInteger.subtractTo(bi_x._bits, bi_y._bits, bits_r);
            return BigInteger.create(bi_x._sign, bits_r, true);
        };
        BigInteger.prototype.subtract = function (other) {
            return BigInteger.subtract(this, other);
        };
        BigInteger.subtractTo = function (x, y, r) {
            if (r == null)
                r = [];
            var l = Math.min(x.length, y.length);
            var c = 0, i = 0;
            while (i < l) {
                c += x[i] - y[i];
                r[i++] = c & DM;
                c >>= DB;
            }
            if (x.length < y.length)
                while (i < y.length) {
                    c -= y[i];
                    r[i++] = c & DM;
                    c >>= DB;
                }
            else
                while (i < x.length) {
                    c += x[i];
                    r[i++] = c & DM;
                    c >>= DB;
                }
            return c < 0;
        };
        BigInteger.prototype.testBit = function (n) {
            var units = Math.floor(n / DB);
            if (this._bits.length <= units)
                return false;
            return (this._bits[units] & (1 << (n %= DB))) != 0;
        };
        BigInteger.prototype.toInt32 = function () {
            if (this._sign == 0)
                return 0;
            if (this._bits.length == 1)
                return this._bits[0] * this._sign;
            return ((this._bits[0] | this._bits[1] * DV) & 0x7fffffff) * this._sign;
        };
        BigInteger.prototype.toString = function (radix) {
            if (radix === void 0) { radix = 10; }
            if (this._sign == 0)
                return "0";
            if (radix < 2 || radix > 36)
                throw new RangeError();
            var s = "";
            for (var bi = this; bi._sign != 0;) {
                var r = BigInteger.divRem(bi, radix);
                var rem = Math.abs(r.remainder.toInt32());
                if (rem < 10)
                    rem += 0x30;
                else
                    rem += 0x57;
                s = String.fromCharCode(rem) + s;
                bi = r.result;
            }
            if (this._sign < 0)
                s = "-" + s;
            return s;
        };
        BigInteger.prototype.toUint8Array = function (littleEndian, length) {
            if (littleEndian === void 0) { littleEndian = true; }
            if (this._sign == 0)
                return new Uint8Array(length || 1);
            var cb = Math.ceil((this._bits.length * DB + 1) / 8);
            var array = new Uint8Array(length || cb);
            for (var i = 0; i < array.length; i++) {
                var offset = littleEndian ? i : array.length - 1 - i;
                var cbits = i * 8;
                var cu = Math.floor(cbits / DB);
                cbits %= DB;
                if (DB - cbits < 8)
                    array[offset] = (this._bits[cu] >>> cbits | this._bits[cu + 1] << (DB - cbits)) & 0xff;
                else
                    array[offset] = this._bits[cu] >>> cbits & 0xff;
            }
            length = length || BigInteger.getActualLength(array);
            if (length < array.length)
                array = array.subarray(0, length);
            return array;
        };
        BigInteger.prototype.toUint8ArrayWithSign = function (littleEndian, length) {
            if (littleEndian === void 0) { littleEndian = true; }
            if (this._sign == 0)
                return new Uint8Array(length || 1);
            if (this._sign > 0) {
                var cb = Math.ceil((this._bits.length * DB + 1) / 8);
                var array_1 = new Uint8Array(length || cb);
                for (var i_3 = 0; i_3 < array_1.length; i_3++) {
                    var offset = littleEndian ? i_3 : array_1.length - 1 - i_3;
                    var cbits = i_3 * 8;
                    var cu = Math.floor(cbits / DB);
                    if (cu <= this._bits.length) {
                        cbits %= DB;
                        if (DB - cbits < 8)
                            array_1[offset] = (this._bits[cu] >>> cbits | this._bits[cu + 1] << (DB - cbits)) & 0xff;
                        else
                            array_1[offset] = this._bits[cu] >>> cbits & 0xff;
                    }
                    else {
                        array_1[offset] = 0;
                    }
                }
                length = length || BigInteger.getActualLength(array_1);
                if (length < array_1.length)
                    array_1 = array_1.subarray(0, length);
                if ((array_1[array_1.length - 1] & 0x80) > 0) {
                    var newarr = new Uint8Array(array_1.length + 1);
                    for (var i = 0; i < array_1.length; i++) {
                        newarr[i] = array_1[i];
                    }
                    newarr[array_1.length] = 0;
                    array_1 = newarr;
                }
                return array_1;
            }
            else {
                var n = this.add(1);
                if (n.sign() < 0)
                    n["_sign"] = 1;
                var array = n.toUint8Array();
                var needaddsign = (array[array.length - 1] & 0x80) > 0;
                var newarr = new Uint8Array(needaddsign ? array.length + 1 : array.length);
                for (var i = 0; i < array.length; i++) {
                    newarr[i] = ~array[i];
                }
                if (needaddsign) {
                    newarr[i] = 0xff;
                }
                array = newarr;
                return array;
            }
        };
        return BigInteger;
    }());
    Neo.BigInteger = BigInteger;
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var D = 100000000;
    var _max, _minus, _min, _one, _satoshi;
    var Fixed8 = (function () {
        function Fixed8(data) {
            this.data = data;
            if (data.bits[1] >= 0x80000000 && (data.bits[0] != 0xffffffff || data.bits[1] != 0xffffffff))
                throw new RangeError();
        }
        Object.defineProperty(Fixed8, "MaxValue", {
            get: function () { return _max || (_max = new Fixed8(new Neo.Uint64(0xffffffff, 0x7fffffff))); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Fixed8, "MinusOne", {
            get: function () { return _minus || (_minus = new Fixed8(new Neo.Uint64(0xffffffff, 0xffffffff))); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Fixed8, "MinValue", {
            get: function () { return _min || (_min = new Fixed8(Neo.Uint64.MinValue)); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Fixed8, "One", {
            get: function () { return _one || (_one = Fixed8.fromNumber(1)); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Fixed8, "Satoshi", {
            get: function () { return _satoshi || (_satoshi = new Fixed8(new Neo.Uint64(1))); },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(Fixed8, "Zero", {
            get: function () { return Fixed8.MinValue; },
            enumerable: true,
            configurable: true
        });
        Fixed8.prototype.add = function (other) {
            var result = this.data.add(other.data);
            if (result.compareTo(this.data) < 0)
                throw new Error();
            return new Fixed8(result);
        };
        Fixed8.prototype.compareTo = function (other) {
            return this.data.compareTo(other.data);
        };
        Fixed8.prototype.equals = function (other) {
            return this.data.equals(other.data);
        };
        Fixed8.fromNumber = function (value) {
            if (value < 0)
                throw new RangeError();
            value *= D;
            if (value >= 0x8000000000000000)
                throw new RangeError();
            var array = new Uint32Array((new Neo.BigInteger(value)).toUint8Array(true, 8).buffer);
            return new Fixed8(new Neo.Uint64(array[0], array[1]));
        };
        Fixed8.prototype.getData = function () {
            return this.data;
        };
        Fixed8.max = function (first) {
            var others = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                others[_i - 1] = arguments[_i];
            }
            for (var i = 0; i < others.length; i++)
                if (first.compareTo(others[i]) < 0)
                    first = others[i];
            return first;
        };
        Fixed8.min = function (first) {
            var others = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                others[_i - 1] = arguments[_i];
            }
            for (var i = 0; i < others.length; i++)
                if (first.compareTo(others[i]) > 0)
                    first = others[i];
            return first;
        };
        Fixed8.parse = function (str) {
            var dot = str.indexOf('.');
            var digits = dot >= 0 ? str.length - dot - 1 : 0;
            str = str.replace('.', '');
            if (digits > 8)
                str = str.substr(0, str.length - digits + 8);
            else if (digits < 8)
                for (var i = digits; i < 8; i++)
                    str += '0';
            return new Fixed8(Neo.Uint64.parse(str));
        };
        Fixed8.prototype.subtract = function (other) {
            if (this.data.compareTo(other.data) < 0)
                throw new Error();
            return new Fixed8(this.data.subtract(other.data));
        };
        Fixed8.prototype.toString = function () {
            var str = this.data.toString();
            while (str.length <= 8)
                str = '0' + str;
            str = str.substr(0, str.length - 8) + '.' + str.substr(str.length - 8);
            var e = 0;
            for (var i = str.length - 1; i >= 0; i--)
                if (str[i] == '0')
                    e++;
                else
                    break;
            str = str.substr(0, str.length - e);
            if (str[str.length - 1] == '.')
                str = str.substr(0, str.length - 1);
            return str;
        };
        Fixed8.prototype.deserialize = function (reader) {
            this.data = reader.readUint64();
        };
        Fixed8.prototype.serialize = function (writer) {
            writer.writeUint64(this.getData());
        };
        return Fixed8;
    }());
    Neo.Fixed8 = Fixed8;
})(Neo || (Neo = {}));
Array.copy = function (src, srcOffset, dst, dstOffset, count) {
    for (var i = 0; i < count; i++)
        dst[i + dstOffset] = src[i + srcOffset];
};
Array.fromArray = function (arr) {
    var array = new Array(arr.length);
    for (var i = 0; i < array.length; i++)
        array[i] = arr[i];
    return array;
};
Uint8Array.fromArrayBuffer = function (buffer) {
    if (buffer instanceof Uint8Array)
        return buffer;
    else if (buffer instanceof ArrayBuffer)
        return new Uint8Array(buffer);
    else {
        var view = buffer;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
};
String.prototype.hexToBytes = function () {
    if ((this.length & 1) != 0)
        throw new RangeError();
    var str = this;
    if (this.length >= 2 && this[0] == '0' && this[1] == 'x')
        str = this.substr(2);
    var bytes = new Uint8Array(str.length / 2);
    for (var i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(str.substr(i * 2, 2), 16);
    }
    return bytes;
};
ArrayBuffer.prototype.slice = ArrayBuffer.prototype.slice || function (begin, end) {
    if (end === void 0) { end = this.byteLength; }
    if (begin < 0)
        begin += this.byteLength;
    if (begin < 0)
        begin = 0;
    if (end < 0)
        end += this.byteLength;
    if (end > this.byteLength)
        end = this.byteLength;
    var length = end - begin;
    if (length < 0)
        length = 0;
    var src = new Uint8Array(this);
    var dst = new Uint8Array(length);
    for (var i = 0; i < length; i++)
        dst[i] = src[i + begin];
    return dst.buffer;
};
Uint8Array.prototype.toHexString = function () {
    var s = "";
    for (var i = 0; i < this.length; i++) {
        s += (this[i] >>> 4).toString(16);
        s += (this[i] & 0xf).toString(16);
    }
    return s;
};
Uint8Array.prototype.clone = function () {
    var u8 = new Uint8Array(this.length);
    for (var i = 0; i < this.length; i++)
        u8[i] = this[i];
    return u8;
};
Uint8Array.prototype.concat = function (data) {
    var newarr = new Uint8Array(this.length + data.length);
    for (var i = 0; i < this.length; i++) {
        newarr[i] = this[i];
    }
    for (var i = 0; i < data.length; i++) {
        newarr[this.length + i] = data[i];
    }
    return newarr;
};
void function () {
    function fillArray(value, start, end) {
        if (start === void 0) { start = 0; }
        if (end === void 0) { end = this.length; }
        if (start < 0)
            start += this.length;
        if (start < 0)
            start = 0;
        if (start >= this.length)
            return this;
        if (end < 0)
            end += this.length;
        if (end < 0)
            return this;
        if (end > this.length)
            end = this.length;
        for (var i = start; i < end; i++)
            this[i] = value;
        return this;
    }
    Array.prototype.fill = Array.prototype.fill || fillArray;
    Int8Array.prototype.fill = Int8Array.prototype.fill || fillArray;
    Int16Array.prototype.fill = Int16Array.prototype.fill || fillArray;
    Int32Array.prototype.fill = Int32Array.prototype.fill || fillArray;
    Uint8Array.prototype.fill = Uint8Array.prototype.fill || fillArray;
    Uint16Array.prototype.fill = Uint16Array.prototype.fill || fillArray;
    Uint32Array.prototype.fill = Uint32Array.prototype.fill || fillArray;
}();
var NeoMap = (function () {
    function NeoMap() {
        this._map = new Object();
        this._size = 0;
    }
    Object.defineProperty(NeoMap.prototype, "size", {
        get: function () { return this._size; },
        enumerable: true,
        configurable: true
    });
    NeoMap.prototype.clear = function () {
        for (var key in this._map)
            delete this._map[key];
        this._size = 0;
    };
    NeoMap.prototype.delete = function (key) {
        if (!this._map.hasOwnProperty(key))
            return false;
        this._size--;
        return delete this._map[key];
    };
    NeoMap.prototype.forEach = function (callback) {
        for (var key in this._map)
            callback(this._map[key], key, this);
    };
    NeoMap.prototype.get = function (key) {
        return this._map[key];
    };
    NeoMap.prototype.has = function (key) {
        return this._map.hasOwnProperty(key);
    };
    NeoMap.prototype.set = function (key, value) {
        if (!this._map.hasOwnProperty(key))
            this._size++;
        this._map[key] = value;
    };
    return NeoMap;
}());
var PromiseState;
(function (PromiseState) {
    PromiseState[PromiseState["pending"] = 0] = "pending";
    PromiseState[PromiseState["fulfilled"] = 1] = "fulfilled";
    PromiseState[PromiseState["rejected"] = 2] = "rejected";
})(PromiseState || (PromiseState = {}));
var NeoPromise = (function () {
    function NeoPromise(executor) {
        this._state = PromiseState.pending;
        this._callback_attached = false;
        if (executor != null)
            executor(this.resolve.bind(this), this.reject.bind(this));
    }
    NeoPromise.all = function (iterable) {
        return new NeoPromise(function (resolve, reject) {
            if (iterable.length == 0) {
                resolve([]);
                return;
            }
            var results = new Array(iterable.length);
            var rejected = false;
            var onFulfilled = function (result) {
                results[this._tag] = result;
                for (var i = 0; i < iterable.length; i++)
                    if (iterable[i]._state != PromiseState.fulfilled)
                        return;
                resolve(results);
            };
            var onRejected = function (reason) {
                if (!rejected) {
                    rejected = true;
                    reject(reason);
                }
            };
            for (var i = 0; i < iterable.length; i++) {
                iterable[i]._tag = i;
                iterable[i].then(onFulfilled, onRejected);
            }
        });
    };
    NeoPromise.prototype.catch = function (onRejected) {
        return this.then(null, onRejected);
    };
    NeoPromise.prototype.checkState = function () {
        if (this._state != PromiseState.pending && this._callback_attached) {
            var callback = this._state == PromiseState.fulfilled ? this._onFulfilled : this._onRejected;
            var arg = this._state == PromiseState.fulfilled ? this._value : this._reason;
            var value = void 0, reason = void 0;
            try {
                value = callback == null ? this : callback.call(this, arg);
            }
            catch (ex) {
                reason = ex;
            }
            if (this._next_promise == null) {
                if (reason != null)
                    return NeoPromise.reject(reason);
                else if (value instanceof NeoPromise)
                    return value;
                else
                    return NeoPromise.resolve(value);
            }
            else {
                if (reason != null)
                    this._next_promise.reject(reason);
                else if (value instanceof NeoPromise)
                    value.then(this.resolve.bind(this._next_promise), this.reject.bind(this._next_promise));
                else
                    this._next_promise.resolve(value);
            }
        }
    };
    NeoPromise.prototype.reject = function (reason) {
        this._state = PromiseState.rejected;
        this._reason = reason;
        this.checkState();
    };
    NeoPromise.reject = function (reason) {
        return new NeoPromise(function (resolve, reject) { return reject(reason); });
    };
    NeoPromise.prototype.resolve = function (value) {
        this._state = PromiseState.fulfilled;
        this._value = value;
        this.checkState();
    };
    NeoPromise.resolve = function (value) {
        if (value instanceof NeoPromise)
            return value;
        return new NeoPromise(function (resolve, reject) { return resolve(value); });
    };
    NeoPromise.prototype.then = function (onFulfilled, onRejected) {
        this._onFulfilled = onFulfilled;
        this._onRejected = onRejected;
        this._callback_attached = true;
        if (this._state == PromiseState.pending) {
            this._next_promise = new NeoPromise(null);
            return this._next_promise;
        }
        else {
            return this.checkState();
        }
    };
    return NeoPromise;
}());
var Neo;
(function (Neo) {
    var _zero;
    var Uint160 = (function (_super) {
        __extends(Uint160, _super);
        function Uint160(value) {
            var _this = this;
            if (value == null)
                value = new ArrayBuffer(20);
            if (value.byteLength != 20)
                throw new RangeError();
            _this = _super.call(this, new Uint32Array(value)) || this;
            return _this;
        }
        Object.defineProperty(Uint160, "Zero", {
            get: function () { return _zero || (_zero = new Uint160()); },
            enumerable: true,
            configurable: true
        });
        Uint160.parse = function (str) {
            if (str.length != 40)
                throw new RangeError();
            var x = str.hexToBytes();
            var y = new Uint8Array(x.length);
            for (var i = 0; i < y.length; i++)
                y[i] = x[x.length - i - 1];
            return new Uint160(y.buffer);
        };
        return Uint160;
    }(Neo.UintVariable));
    Neo.Uint160 = Uint160;
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var _zero;
    var Uint256 = (function (_super) {
        __extends(Uint256, _super);
        function Uint256(value) {
            var _this = this;
            if (value == null)
                value = new ArrayBuffer(32);
            if (value.byteLength != 32)
                throw new RangeError();
            _this = _super.call(this, new Uint32Array(value)) || this;
            return _this;
        }
        Object.defineProperty(Uint256, "Zero", {
            get: function () { return _zero || (_zero = new Uint256()); },
            enumerable: true,
            configurable: true
        });
        Uint256.parse = function (str) {
            if (str.length != 64)
                throw new RangeError();
            var x = str.hexToBytes();
            var y = new Uint8Array(x.length);
            for (var i = 0; i < y.length; i++)
                y[i] = x[x.length - i - 1];
            return new Uint256(y.buffer);
        };
        return Uint256;
    }(Neo.UintVariable));
    Neo.Uint256 = Uint256;
})(Neo || (Neo = {}));
var ThinNeo;
(function (ThinNeo) {
    var contract = (function () {
        function contract() {
            this.parameters = [{ "name": "parameter0", "type": "Signature" }];
            this.deployed = false;
        }
        return contract;
    }());
    ThinNeo.contract = contract;
    var nep6account = (function () {
        function nep6account() {
        }
        nep6account.prototype.getPrivateKey = function (scrypt, password, callback) {
            var _this = this;
            var cb = function (i, r) {
                if (i == "finish") {
                    var bytes = r;
                    var pkey = ThinNeo.Helper.GetPublicKeyFromPrivateKey(bytes);
                    var address = ThinNeo.Helper.GetAddressFromPublicKey(pkey);
                    if (address == _this.address) {
                        callback(i, r);
                    }
                    else {
                        callback("error", "checkerror");
                    }
                }
                else {
                    callback(i, r);
                }
            };
            ThinNeo.Helper.GetPrivateKeyFromNep2(this.nep2key, password, scrypt.N, scrypt.r, scrypt.p, cb);
        };
        return nep6account;
    }());
    ThinNeo.nep6account = nep6account;
    var nep6ScryptParameters = (function () {
        function nep6ScryptParameters() {
        }
        return nep6ScryptParameters;
    }());
    ThinNeo.nep6ScryptParameters = nep6ScryptParameters;
    var nep6wallet = (function () {
        function nep6wallet() {
        }
        nep6wallet.prototype.fromJsonStr = function (jsonstr) {
            var json = JSON.parse(jsonstr);
            this.scrypt = new nep6ScryptParameters();
            this.scrypt.N = json.scrypt.n;
            this.scrypt.r = json.scrypt.r;
            this.scrypt.p = json.scrypt.p;
            this.accounts = [];
            for (var i = 0; i < json.accounts.length; i++) {
                var acc = json.accounts[i];
                var localacc = new nep6account();
                localacc.address = acc.address;
                localacc.nep2key = acc.key;
                localacc.contract = acc.contract;
                if (localacc.contract == null || localacc.contract.script == null) {
                    localacc.nep2key = null;
                }
                else {
                    var ss = localacc.contract.script.hexToBytes();
                    if (ss.length != 35 || ss[0] != 33 || ss[34] != 172) {
                        localacc.nep2key = null;
                    }
                }
                if (acc.key == undefined)
                    localacc.nep2key = null;
                this.accounts.push(localacc);
            }
        };
        nep6wallet.prototype.toJson = function () {
            var obj = {};
            obj["name"] = null;
            obj["version"] = "1.0";
            obj["scrypt"] = {
                "n": this.scrypt.N,
                "r": this.scrypt.r,
                "p": this.scrypt.p
            };
            var accounts = [];
            for (var i = 0; i < this.accounts.length; i++) {
                var acc = this.accounts[0];
                var jsonacc = {};
                jsonacc["address"] = acc.address;
                jsonacc["label"] = null;
                jsonacc["isDefault"] = false;
                jsonacc["lock"] = false;
                jsonacc["key"] = acc.nep2key;
                jsonacc["extra"] = null;
                jsonacc["contract"] = acc.contract;
                accounts.push(jsonacc);
            }
            obj["accounts"] = accounts;
            obj["extra"] = null;
            return obj;
        };
        return nep6wallet;
    }());
    ThinNeo.nep6wallet = nep6wallet;
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var Base64 = (function () {
        function Base64() {
        }
        Base64.init = function () {
            if (Base64.binited)
                return;
            Base64.lookup = [];
            Base64.revLookup = [];
            for (var i = 0, len = Base64.code.length; i < len; ++i) {
                Base64.lookup[i] = Base64.code[i];
                Base64.revLookup[Base64.code.charCodeAt(i)] = i;
            }
            Base64.revLookup['-'.charCodeAt(0)] = 62;
            Base64.revLookup['_'.charCodeAt(0)] = 63;
            Base64.binited = true;
        };
        Base64.placeHoldersCount = function (b64) {
            var len = b64.length;
            if (len % 4 > 0) {
                throw new Error('Invalid string. Length must be a multiple of 4');
            }
            return b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;
        };
        Base64.byteLength = function (b64) {
            return (b64.length * 3 / 4) - Base64.placeHoldersCount(b64);
        };
        Base64.toByteArray = function (b64) {
            Base64.init();
            var i, l, tmp, placeHolders, arr;
            var len = b64.length;
            placeHolders = Base64.placeHoldersCount(b64);
            arr = new Uint8Array((len * 3 / 4) - placeHolders);
            l = placeHolders > 0 ? len - 4 : len;
            var L = 0;
            for (i = 0; i < l; i += 4) {
                tmp = (Base64.revLookup[b64.charCodeAt(i)] << 18) | (Base64.revLookup[b64.charCodeAt(i + 1)] << 12) | (Base64.revLookup[b64.charCodeAt(i + 2)] << 6) | Base64.revLookup[b64.charCodeAt(i + 3)];
                arr[L++] = (tmp >> 16) & 0xFF;
                arr[L++] = (tmp >> 8) & 0xFF;
                arr[L++] = tmp & 0xFF;
            }
            if (placeHolders === 2) {
                tmp = (Base64.revLookup[b64.charCodeAt(i)] << 2) | (Base64.revLookup[b64.charCodeAt(i + 1)] >> 4);
                arr[L++] = tmp & 0xFF;
            }
            else if (placeHolders === 1) {
                tmp = (Base64.revLookup[b64.charCodeAt(i)] << 10) | (Base64.revLookup[b64.charCodeAt(i + 1)] << 4) | (Base64.revLookup[b64.charCodeAt(i + 2)] >> 2);
                arr[L++] = (tmp >> 8) & 0xFF;
                arr[L++] = tmp & 0xFF;
            }
            return arr;
        };
        Base64.tripletToBase64 = function (num) {
            return Base64.lookup[num >> 18 & 0x3F] + Base64.lookup[num >> 12 & 0x3F] + Base64.lookup[num >> 6 & 0x3F] + Base64.lookup[num & 0x3F];
        };
        Base64.encodeChunk = function (uint8, start, end) {
            var tmp;
            var output = [];
            for (var i = start; i < end; i += 3) {
                tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
                output.push(Base64.tripletToBase64(tmp));
            }
            return output.join('');
        };
        Base64.fromByteArray = function (uint8) {
            Base64.init();
            var tmp;
            var len = uint8.length;
            var extraBytes = len % 3;
            var output = '';
            var parts = [];
            var maxChunkLength = 16383;
            for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
                parts.push(Base64.encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
            }
            if (extraBytes === 1) {
                tmp = uint8[len - 1];
                output += Base64.lookup[tmp >> 2];
                output += Base64.lookup[(tmp << 4) & 0x3F];
                output += '==';
            }
            else if (extraBytes === 2) {
                tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
                output += Base64.lookup[tmp >> 10];
                output += Base64.lookup[(tmp >> 4) & 0x3F];
                output += Base64.lookup[(tmp << 2) & 0x3F];
                output += '=';
            }
            parts.push(output);
            return parts.join('');
        };
        Base64.lookup = [];
        Base64.revLookup = [];
        Base64.code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        Base64.binited = false;
        return Base64;
    }());
    ThinNeo.Base64 = Base64;
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var scrypt_loaded = false;
    var Helper = (function () {
        function Helper() {
        }
        Helper.GetPrivateKeyFromWIF = function (wif) {
            if (wif == null)
                throw new Error("null wif");
            var data = Neo.Cryptography.Base58.decode(wif);
            if (data.length != 38 || data[0] != 0x80 || data[33] != 0x01)
                throw new Error("wif length or tag is error");
            var sum = data.subarray(data.length - 4, data.length);
            var realdata = data.subarray(0, data.length - 4);
            var _checksum = Neo.Cryptography.Sha256.computeHash(realdata);
            var checksum = new Uint8Array(Neo.Cryptography.Sha256.computeHash(_checksum));
            var sumcalc = checksum.subarray(0, 4);
            for (var i = 0; i < 4; i++) {
                if (sum[i] != sumcalc[i])
                    throw new Error("the sum is not match.");
            }
            var privateKey = data.subarray(1, 1 + 32);
            return privateKey;
        };
        Helper.GetWifFromPrivateKey = function (prikey) {
            var data = new Uint8Array(38);
            data[0] = 0x80;
            data[33] = 0x01;
            for (var i = 0; i < 32; i++) {
                data[i + 1] = prikey[i];
            }
            var realdata = data.subarray(0, data.length - 4);
            var _checksum = Neo.Cryptography.Sha256.computeHash(realdata);
            var checksum = new Uint8Array(Neo.Cryptography.Sha256.computeHash(_checksum));
            for (var i = 0; i < 4; i++) {
                data[34 + i] = checksum[i];
            }
            var wif = Neo.Cryptography.Base58.encode(data);
            return wif;
        };
        Helper.GetPublicKeyFromPrivateKey = function (privateKey) {
            var pkey = Neo.Cryptography.ECPoint.multiply(Neo.Cryptography.ECCurve.secp256r1.G, privateKey);
            return pkey.encodePoint(true);
        };
        Helper.Hash160 = function (data) {
            var hash1 = Neo.Cryptography.Sha256.computeHash(data);
            var hash2 = Neo.Cryptography.RIPEMD160.computeHash(hash1);
            return new Uint8Array(hash2);
        };
        Helper.GetAddressCheckScriptFromPublicKey = function (publicKey) {
            var script = new Uint8Array(publicKey.length + 2);
            script[0] = publicKey.length;
            for (var i = 0; i < publicKey.length; i++) {
                script[i + 1] = publicKey[i];
            }
            ;
            script[script.length - 1] = 172;
            return script;
        };
        Helper.GetPublicKeyScriptHashFromPublicKey = function (publicKey) {
            var script = Helper.GetAddressCheckScriptFromPublicKey(publicKey);
            var scripthash = Neo.Cryptography.Sha256.computeHash(script);
            scripthash = Neo.Cryptography.RIPEMD160.computeHash(scripthash);
            return new Uint8Array(scripthash);
        };
        Helper.GetScriptHashFromScript = function (script) {
            var scripthash = Neo.Cryptography.Sha256.computeHash(script);
            scripthash = Neo.Cryptography.RIPEMD160.computeHash(scripthash);
            return new Uint8Array(scripthash);
        };
        Helper.GetAddressFromScriptHash = function (scripthash) {
            var script_hash;
            if (scripthash instanceof Neo.Uint160) {
                script_hash = new Uint8Array(scripthash.bits.buffer);
            }
            else {
                script_hash = scripthash;
            }
            var data = new Uint8Array(script_hash.length + 1);
            data[0] = 0x17;
            for (var i = 0; i < script_hash.length; i++) {
                data[i + 1] = script_hash[i];
            }
            var hash = Neo.Cryptography.Sha256.computeHash(data);
            hash = Neo.Cryptography.Sha256.computeHash(hash);
            var hashu8 = new Uint8Array(hash, 0, 4);
            var alldata = new Uint8Array(data.length + 4);
            for (var i = 0; i < data.length; i++) {
                alldata[i] = data[i];
            }
            for (var i = 0; i < 4; i++) {
                alldata[data.length + i] = hashu8[i];
            }
            return Neo.Cryptography.Base58.encode(alldata);
        };
        Helper.GetAddressFromPublicKey = function (publicKey) {
            var scripthash = Helper.GetPublicKeyScriptHashFromPublicKey(publicKey);
            return Helper.GetAddressFromScriptHash(scripthash);
        };
        Helper.GetPublicKeyScriptHash_FromAddress = function (address) {
            var array = Neo.Cryptography.Base58.decode(address);
            var salt = array.subarray(0, 1);
            var hash = array.subarray(1, 1 + 20);
            var check = array.subarray(21, 21 + 4);
            var checkdata = array.subarray(0, 21);
            var hashd = Neo.Cryptography.Sha256.computeHash(checkdata);
            hashd = Neo.Cryptography.Sha256.computeHash(hashd);
            var hashd = hashd.slice(0, 4);
            var checked = new Uint8Array(hashd);
            for (var i = 0; i < 4; i++) {
                if (checked[i] != check[i]) {
                    throw new Error("the sum is not match.");
                }
            }
            return hash.clone();
        };
        Helper.Sign = function (message, privateKey) {
            var PublicKey = Neo.Cryptography.ECPoint.multiply(Neo.Cryptography.ECCurve.secp256r1.G, privateKey);
            var pubkey = PublicKey.encodePoint(false).subarray(1, 64);
            var key = new Neo.Cryptography.ECDsaCryptoKey(PublicKey, privateKey);
            var ecdsa = new Neo.Cryptography.ECDsa(key);
            {
                return new Uint8Array(ecdsa.sign(message));
            }
        };
        Helper.VerifySignature = function (message, signature, pubkey) {
            var PublicKey = Neo.Cryptography.ECPoint.decodePoint(pubkey, Neo.Cryptography.ECCurve.secp256r1);
            var usepk = PublicKey.encodePoint(false).subarray(1, 64);
            var key = new Neo.Cryptography.ECDsaCryptoKey(PublicKey);
            var ecdsa = new Neo.Cryptography.ECDsa(key);
            {
                return ecdsa.verify(message, signature);
            }
        };
        Helper.String2Bytes = function (str) {
            var back = [];
            var byteSize = 0;
            for (var i = 0; i < str.length; i++) {
                var code = str.charCodeAt(i);
                if (0x00 <= code && code <= 0x7f) {
                    byteSize += 1;
                    back.push(code);
                }
                else if (0x80 <= code && code <= 0x7ff) {
                    byteSize += 2;
                    back.push((192 | (31 & (code >> 6))));
                    back.push((128 | (63 & code)));
                }
                else if ((0x800 <= code && code <= 0xd7ff)
                    || (0xe000 <= code && code <= 0xffff)) {
                    byteSize += 3;
                    back.push((224 | (15 & (code >> 12))));
                    back.push((128 | (63 & (code >> 6))));
                    back.push((128 | (63 & code)));
                }
            }
            var uarr = new Uint8Array(back.length);
            for (i = 0; i < back.length; i++) {
                uarr[i] = back[i] & 0xff;
            }
            return uarr;
        };
        Helper.Bytes2String = function (_arr) {
            var UTF = '';
            for (var i = 0; i < _arr.length; i++) {
                var one = _arr[i].toString(2), v = one.match(/^1+?(?=0)/);
                if (v && one.length == 8) {
                    var bytesLength = v[0].length;
                    var store = _arr[i].toString(2).slice(7 - bytesLength);
                    for (var st = 1; st < bytesLength; st++) {
                        store += _arr[st + i].toString(2).slice(2);
                    }
                    UTF += String.fromCharCode(parseInt(store, 2));
                    i += bytesLength - 1;
                }
                else {
                    UTF += String.fromCharCode(_arr[i]);
                }
            }
            return UTF;
        };
        Helper.Aes256Encrypt = function (src, key) {
            var srcs = CryptoJS.enc.Utf8.parse(src);
            var keys = CryptoJS.enc.Utf8.parse(key);
            var encryptedkey = CryptoJS.AES.encrypt(srcs, keys, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.NoPadding
            });
            return encryptedkey.ciphertext.toString();
        };
        Helper.Aes256Encrypt_u8 = function (src, key) {
            var srcs = CryptoJS.enc.Utf8.parse("1234123412341234");
            srcs.sigBytes = src.length;
            srcs.words = new Array(src.length / 4);
            for (var i = 0; i < src.length / 4; i++) {
                srcs.words[i] = src[i * 4 + 3] + src[i * 4 + 2] * 256 + src[i * 4 + 1] * 256 * 256 + src[i * 4 + 0] * 256 * 256 * 256;
            }
            var keys = CryptoJS.enc.Utf8.parse("1234123412341234");
            keys.sigBytes = key.length;
            keys.words = new Array(key.length / 4);
            for (var i = 0; i < key.length / 4; i++) {
                keys.words[i] = key[i * 4 + 3] + key[i * 4 + 2] * 256 + key[i * 4 + 1] * 256 * 256 + key[i * 4 + 0] * 256 * 256 * 256;
            }
            var encryptedkey = CryptoJS.AES.encrypt(srcs, keys, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.NoPadding
            });
            var str = encryptedkey.ciphertext.toString();
            return str.hexToBytes();
        };
        Helper.Aes256Decrypt_u8 = function (encryptedkey, key) {
            var keys = CryptoJS.enc.Utf8.parse("1234123412341234");
            keys.sigBytes = key.length;
            keys.words = new Array(key.length / 4);
            for (var i = 0; i < key.length / 4; i++) {
                keys.words[i] = key[i * 4 + 3] + key[i * 4 + 2] * 256 + key[i * 4 + 1] * 256 * 256 + key[i * 4 + 0] * 256 * 256 * 256;
            }
            var base64key = ThinNeo.Base64.fromByteArray(encryptedkey);
            var srcs = CryptoJS.AES.decrypt(base64key, keys, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.NoPadding
            });
            var str = srcs.toString();
            return str.hexToBytes();
        };
        Helper.GetNep2FromPrivateKey = function (prikey, passphrase, n, r, p, callback) {
            if (n === void 0) { n = 16384; }
            if (r === void 0) { r = 8; }
            if (p === void 0) { p = 8; }
            var pp = scrypt.getAvailableMod();
            scrypt.setResPath('lib/asset');
            var addresshash = null;
            var ready = function () {
                var param = {
                    N: n,
                    r: r,
                    P: p
                };
                var opt = {
                    maxPassLen: 32,
                    maxSaltLen: 32,
                    maxDkLen: 64,
                    maxThread: 4
                };
                try {
                    scrypt.config(param, opt);
                }
                catch (err) {
                    console.warn('config err: ', err);
                }
            };
            scrypt.onload = function () {
                console.log("scrypt.onload");
                scrypt_loaded = true;
                ready();
            };
            scrypt.onerror = function (err) {
                console.warn('scrypt err:', err);
                callback("error", err);
            };
            scrypt.oncomplete = function (dk) {
                console.log('done', scrypt.binToHex(dk));
                var u8dk = new Uint8Array(dk);
                var derivedhalf1 = u8dk.subarray(0, 32);
                var derivedhalf2 = u8dk.subarray(32, 64);
                var u8xor = new Uint8Array(32);
                for (var i = 0; i < 32; i++) {
                    u8xor[i] = prikey[i] ^ derivedhalf1[i];
                }
                var encryptedkey = Helper.Aes256Encrypt_u8(u8xor, derivedhalf2);
                var buffer = new Uint8Array(39);
                buffer[0] = 0x01;
                buffer[1] = 0x42;
                buffer[2] = 0xe0;
                for (var i = 3; i < 3 + 4; i++) {
                    buffer[i] = addresshash[i - 3];
                }
                for (var i = 7; i < 32 + 7; i++) {
                    buffer[i] = encryptedkey[i - 7];
                }
                var b1 = Neo.Cryptography.Sha256.computeHash(buffer);
                b1 = Neo.Cryptography.Sha256.computeHash(b1);
                var u8hash = new Uint8Array(b1);
                var outbuf = new Uint8Array(39 + 4);
                for (var i = 0; i < 39; i++) {
                    outbuf[i] = buffer[i];
                }
                for (var i = 39; i < 39 + 4; i++) {
                    outbuf[i] = u8hash[i - 39];
                }
                var base58str = Neo.Cryptography.Base58.encode(outbuf);
                callback("finish", base58str);
            };
            scrypt.onprogress = function (percent) {
                console.log('onprogress');
            };
            scrypt.onready = function () {
                var pubkey = Helper.GetPublicKeyFromPrivateKey(prikey);
                var script_hash = Helper.GetPublicKeyScriptHashFromPublicKey(pubkey);
                var address = Helper.GetAddressFromScriptHash(script_hash);
                var addrbin = scrypt.strToBin(address);
                var b1 = Neo.Cryptography.Sha256.computeHash(addrbin);
                b1 = Neo.Cryptography.Sha256.computeHash(b1);
                var b2 = new Uint8Array(b1);
                addresshash = b2.subarray(0, 4);
                var passbin = scrypt.strToBin(passphrase);
                scrypt.hash(passbin, addresshash, 64);
            };
            if (scrypt_loaded == false) {
                scrypt.load("asmjs");
            }
            else {
                ready();
            }
            return;
        };
        Helper.GetPrivateKeyFromNep2 = function (nep2, passphrase, n, r, p, callback) {
            if (n === void 0) { n = 16384; }
            if (r === void 0) { r = 8; }
            if (p === void 0) { p = 8; }
            var data = Neo.Cryptography.Base58.decode(nep2);
            if (data.length != 39 + 4) {
                callback("error", "data.length error");
                return;
            }
            if (data[0] != 0x01 || data[1] != 0x42 || data[2] != 0xe0) {
                callback("error", "dataheader error");
                return;
            }
            var hash = data.subarray(39, 39 + 4);
            var buffer = data.subarray(0, 39);
            var b1 = Neo.Cryptography.Sha256.computeHash(buffer);
            b1 = Neo.Cryptography.Sha256.computeHash(b1);
            var u8hash = new Uint8Array(b1);
            for (var i = 0; i < 4; i++) {
                if (u8hash[i] != hash[i]) {
                    callback("error", "data hash error");
                    return;
                }
            }
            var addresshash = buffer.subarray(3, 3 + 4);
            var encryptedkey = buffer.subarray(7, 7 + 32);
            var pp = scrypt.getAvailableMod();
            scrypt.setResPath('lib/asset');
            var ready = function () {
                var param = {
                    N: n,
                    r: r,
                    P: p
                };
                var opt = {
                    maxPassLen: 32,
                    maxSaltLen: 32,
                    maxDkLen: 64,
                    maxThread: 4
                };
                try {
                    scrypt.config(param, opt);
                }
                catch (err) {
                    console.warn('config err: ', err);
                }
            };
            scrypt.onload = function () {
                console.log("scrypt.onload");
                scrypt_loaded = true;
                ready();
            };
            scrypt.oncomplete = function (dk) {
                console.log('done', scrypt.binToHex(dk));
                var u8dk = new Uint8Array(dk);
                var derivedhalf1 = u8dk.subarray(0, 32);
                var derivedhalf2 = u8dk.subarray(32, 64);
                var u8xor = Helper.Aes256Decrypt_u8(encryptedkey, derivedhalf2);
                var prikey = new Uint8Array(u8xor.length);
                for (var i = 0; i < 32; i++) {
                    prikey[i] = u8xor[i] ^ derivedhalf1[i];
                }
                var pubkey = Helper.GetPublicKeyFromPrivateKey(prikey);
                var script_hash = Helper.GetPublicKeyScriptHashFromPublicKey(pubkey);
                var address = Helper.GetAddressFromScriptHash(script_hash);
                var addrbin = scrypt.strToBin(address);
                var b1 = Neo.Cryptography.Sha256.computeHash(addrbin);
                b1 = Neo.Cryptography.Sha256.computeHash(b1);
                var b2 = new Uint8Array(b1);
                var addresshashgot = b2.subarray(0, 4);
                for (var i = 0; i < 4; i++) {
                    if (addresshash[i] != b2[i]) {
                        callback("error", "nep2 hash not match.");
                        return;
                    }
                }
                callback("finish", prikey);
            };
            scrypt.onerror = function (err) {
                console.warn('scrypt err:', err);
                callback("error", err);
            };
            scrypt.onprogress = function (percent) {
                console.log('onprogress');
            };
            scrypt.onready = function () {
                var passbin = scrypt.strToBin(passphrase);
                scrypt.hash(passbin, addresshash, 64);
            };
            if (scrypt_loaded == false) {
                scrypt.load("asmjs");
            }
            else {
                ready();
            }
        };
        return Helper;
    }());
    ThinNeo.Helper = Helper;
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var OpCode;
    (function (OpCode) {
        OpCode[OpCode["PUSH0"] = 0] = "PUSH0";
        OpCode[OpCode["PUSHF"] = 0] = "PUSHF";
        OpCode[OpCode["PUSHBYTES1"] = 1] = "PUSHBYTES1";
        OpCode[OpCode["PUSHBYTES75"] = 75] = "PUSHBYTES75";
        OpCode[OpCode["PUSHDATA1"] = 76] = "PUSHDATA1";
        OpCode[OpCode["PUSHDATA2"] = 77] = "PUSHDATA2";
        OpCode[OpCode["PUSHDATA4"] = 78] = "PUSHDATA4";
        OpCode[OpCode["PUSHM1"] = 79] = "PUSHM1";
        OpCode[OpCode["PUSH1"] = 81] = "PUSH1";
        OpCode[OpCode["PUSHT"] = 81] = "PUSHT";
        OpCode[OpCode["PUSH2"] = 82] = "PUSH2";
        OpCode[OpCode["PUSH3"] = 83] = "PUSH3";
        OpCode[OpCode["PUSH4"] = 84] = "PUSH4";
        OpCode[OpCode["PUSH5"] = 85] = "PUSH5";
        OpCode[OpCode["PUSH6"] = 86] = "PUSH6";
        OpCode[OpCode["PUSH7"] = 87] = "PUSH7";
        OpCode[OpCode["PUSH8"] = 88] = "PUSH8";
        OpCode[OpCode["PUSH9"] = 89] = "PUSH9";
        OpCode[OpCode["PUSH10"] = 90] = "PUSH10";
        OpCode[OpCode["PUSH11"] = 91] = "PUSH11";
        OpCode[OpCode["PUSH12"] = 92] = "PUSH12";
        OpCode[OpCode["PUSH13"] = 93] = "PUSH13";
        OpCode[OpCode["PUSH14"] = 94] = "PUSH14";
        OpCode[OpCode["PUSH15"] = 95] = "PUSH15";
        OpCode[OpCode["PUSH16"] = 96] = "PUSH16";
        OpCode[OpCode["NOP"] = 97] = "NOP";
        OpCode[OpCode["JMP"] = 98] = "JMP";
        OpCode[OpCode["JMPIF"] = 99] = "JMPIF";
        OpCode[OpCode["JMPIFNOT"] = 100] = "JMPIFNOT";
        OpCode[OpCode["CALL"] = 101] = "CALL";
        OpCode[OpCode["RET"] = 102] = "RET";
        OpCode[OpCode["APPCALL"] = 103] = "APPCALL";
        OpCode[OpCode["SYSCALL"] = 104] = "SYSCALL";
        OpCode[OpCode["TAILCALL"] = 105] = "TAILCALL";
        OpCode[OpCode["DUPFROMALTSTACK"] = 106] = "DUPFROMALTSTACK";
        OpCode[OpCode["TOALTSTACK"] = 107] = "TOALTSTACK";
        OpCode[OpCode["FROMALTSTACK"] = 108] = "FROMALTSTACK";
        OpCode[OpCode["XDROP"] = 109] = "XDROP";
        OpCode[OpCode["XSWAP"] = 114] = "XSWAP";
        OpCode[OpCode["XTUCK"] = 115] = "XTUCK";
        OpCode[OpCode["DEPTH"] = 116] = "DEPTH";
        OpCode[OpCode["DROP"] = 117] = "DROP";
        OpCode[OpCode["DUP"] = 118] = "DUP";
        OpCode[OpCode["NIP"] = 119] = "NIP";
        OpCode[OpCode["OVER"] = 120] = "OVER";
        OpCode[OpCode["PICK"] = 121] = "PICK";
        OpCode[OpCode["ROLL"] = 122] = "ROLL";
        OpCode[OpCode["ROT"] = 123] = "ROT";
        OpCode[OpCode["SWAP"] = 124] = "SWAP";
        OpCode[OpCode["TUCK"] = 125] = "TUCK";
        OpCode[OpCode["CAT"] = 126] = "CAT";
        OpCode[OpCode["SUBSTR"] = 127] = "SUBSTR";
        OpCode[OpCode["LEFT"] = 128] = "LEFT";
        OpCode[OpCode["RIGHT"] = 129] = "RIGHT";
        OpCode[OpCode["SIZE"] = 130] = "SIZE";
        OpCode[OpCode["INVERT"] = 131] = "INVERT";
        OpCode[OpCode["AND"] = 132] = "AND";
        OpCode[OpCode["OR"] = 133] = "OR";
        OpCode[OpCode["XOR"] = 134] = "XOR";
        OpCode[OpCode["EQUAL"] = 135] = "EQUAL";
        OpCode[OpCode["INC"] = 139] = "INC";
        OpCode[OpCode["DEC"] = 140] = "DEC";
        OpCode[OpCode["SIGN"] = 141] = "SIGN";
        OpCode[OpCode["NEGATE"] = 143] = "NEGATE";
        OpCode[OpCode["ABS"] = 144] = "ABS";
        OpCode[OpCode["NOT"] = 145] = "NOT";
        OpCode[OpCode["NZ"] = 146] = "NZ";
        OpCode[OpCode["ADD"] = 147] = "ADD";
        OpCode[OpCode["SUB"] = 148] = "SUB";
        OpCode[OpCode["MUL"] = 149] = "MUL";
        OpCode[OpCode["DIV"] = 150] = "DIV";
        OpCode[OpCode["MOD"] = 151] = "MOD";
        OpCode[OpCode["SHL"] = 152] = "SHL";
        OpCode[OpCode["SHR"] = 153] = "SHR";
        OpCode[OpCode["BOOLAND"] = 154] = "BOOLAND";
        OpCode[OpCode["BOOLOR"] = 155] = "BOOLOR";
        OpCode[OpCode["NUMEQUAL"] = 156] = "NUMEQUAL";
        OpCode[OpCode["NUMNOTEQUAL"] = 158] = "NUMNOTEQUAL";
        OpCode[OpCode["LT"] = 159] = "LT";
        OpCode[OpCode["GT"] = 160] = "GT";
        OpCode[OpCode["LTE"] = 161] = "LTE";
        OpCode[OpCode["GTE"] = 162] = "GTE";
        OpCode[OpCode["MIN"] = 163] = "MIN";
        OpCode[OpCode["MAX"] = 164] = "MAX";
        OpCode[OpCode["WITHIN"] = 165] = "WITHIN";
        OpCode[OpCode["SHA1"] = 167] = "SHA1";
        OpCode[OpCode["SHA256"] = 168] = "SHA256";
        OpCode[OpCode["HASH160"] = 169] = "HASH160";
        OpCode[OpCode["HASH256"] = 170] = "HASH256";
        OpCode[OpCode["CSHARPSTRHASH32"] = 171] = "CSHARPSTRHASH32";
        OpCode[OpCode["JAVAHASH32"] = 173] = "JAVAHASH32";
        OpCode[OpCode["CHECKSIG"] = 172] = "CHECKSIG";
        OpCode[OpCode["CHECKMULTISIG"] = 174] = "CHECKMULTISIG";
        OpCode[OpCode["ARRAYSIZE"] = 192] = "ARRAYSIZE";
        OpCode[OpCode["PACK"] = 193] = "PACK";
        OpCode[OpCode["UNPACK"] = 194] = "UNPACK";
        OpCode[OpCode["PICKITEM"] = 195] = "PICKITEM";
        OpCode[OpCode["SETITEM"] = 196] = "SETITEM";
        OpCode[OpCode["NEWARRAY"] = 197] = "NEWARRAY";
        OpCode[OpCode["NEWSTRUCT"] = 198] = "NEWSTRUCT";
        OpCode[OpCode["SWITCH"] = 208] = "SWITCH";
        OpCode[OpCode["THROW"] = 240] = "THROW";
        OpCode[OpCode["THROWIFNOT"] = 241] = "THROWIFNOT";
    })(OpCode = ThinNeo.OpCode || (ThinNeo.OpCode = {}));
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var ScriptBuilder = (function () {
        function ScriptBuilder() {
            this.Offset = 0;
            this.writer = [];
        }
        ScriptBuilder.prototype._WriteUint8 = function (num) {
            this.writer.push(num);
            this.Offset++;
        };
        ScriptBuilder.prototype._WriteUint16 = function (num) {
            var buf = new Uint8Array(2);
            var d = new DataView(buf.buffer, 0, 2);
            d.setUint16(0, num, true);
            this.writer.push(buf[0]);
            this.writer.push(buf[1]);
            this.Offset += 2;
        };
        ScriptBuilder.prototype._WriteUint32 = function (num) {
            var buf = new Uint8Array(4);
            var d = new DataView(buf.buffer, 0, 4);
            d.setUint32(0, num, true);
            this.writer.push(buf[0]);
            this.writer.push(buf[1]);
            this.writer.push(buf[2]);
            this.writer.push(buf[3]);
            this.Offset += 4;
        };
        ScriptBuilder.prototype._WriteUint8Array = function (nums) {
            for (var i = 0; i < nums.length; i++)
                this.writer.push(nums[i]);
            this.Offset += nums.length;
        };
        ScriptBuilder.prototype._ConvertInt16ToBytes = function (num) {
            var buf = new Uint8Array(2);
            var d = new DataView(buf.buffer, 0, 2);
            d.setInt16(0, num, true);
            return buf;
        };
        ScriptBuilder.prototype.Emit = function (op, arg) {
            if (arg === void 0) { arg = null; }
            this._WriteUint8(op);
            if (arg != null)
                this._WriteUint8Array(arg);
            return this;
        };
        ScriptBuilder.prototype.EmitAppCall = function (scriptHash, useTailCall) {
            if (useTailCall === void 0) { useTailCall = false; }
            var hash = null;
            if (scriptHash instanceof Neo.Uint160) {
                hash = new Uint8Array(scriptHash.bits.buffer);
            }
            else if (scriptHash.length != 20)
                throw new Error("error scriptHash length");
            else {
                hash = scriptHash;
            }
            return this.Emit(useTailCall ? ThinNeo.OpCode.TAILCALL : ThinNeo.OpCode.APPCALL, hash);
        };
        ScriptBuilder.prototype.EmitJump = function (op, offset) {
            if (op != ThinNeo.OpCode.JMP && op != ThinNeo.OpCode.JMPIF && op != ThinNeo.OpCode.JMPIFNOT && op != ThinNeo.OpCode.CALL)
                throw new Error("ArgumentException");
            return this.Emit(op, this._ConvertInt16ToBytes(offset));
        };
        ScriptBuilder.prototype.EmitPushNumber = function (number) {
            var i32 = number.toInt32();
            if (i32 == -1)
                return this.Emit(ThinNeo.OpCode.PUSHM1);
            if (i32 == 0)
                return this.Emit(ThinNeo.OpCode.PUSH0);
            if (i32 > 0 && i32 <= 16)
                return this.Emit(ThinNeo.OpCode.PUSH1 - 1 + i32);
            return this.EmitPushBytes(number.toUint8ArrayWithSign(true));
        };
        ScriptBuilder.prototype.EmitPushBool = function (data) {
            return this.Emit(data ? ThinNeo.OpCode.PUSHT : ThinNeo.OpCode.PUSHF);
        };
        ScriptBuilder.prototype.EmitPushBytes = function (data) {
            if (data == null)
                throw new Error("ArgumentNullException");
            if (data.length <= ThinNeo.OpCode.PUSHBYTES75) {
                this._WriteUint8(data.length);
                this._WriteUint8Array(data);
            }
            else if (data.length < 0x100) {
                this.Emit(ThinNeo.OpCode.PUSHDATA1);
                this._WriteUint8(data.length);
                this._WriteUint8Array(data);
            }
            else if (data.length < 0x10000) {
                this.Emit(ThinNeo.OpCode.PUSHDATA2);
                this._WriteUint16(data.length);
                this._WriteUint8Array(data);
            }
            else {
                this.Emit(ThinNeo.OpCode.PUSHDATA4);
                this._WriteUint32(data.length);
                this._WriteUint8Array(data);
            }
            return this;
        };
        ScriptBuilder.prototype.EmitPushString = function (data) {
            return this.EmitPushBytes(ThinNeo.Helper.String2Bytes(data));
        };
        ScriptBuilder.prototype.EmitSysCall = function (api) {
            if (api == null)
                throw new Error("ArgumentNullException");
            var api_bytes = ThinNeo.Helper.String2Bytes(api);
            if (api_bytes.length == 0 || api_bytes.length > 252)
                throw new Error("ArgumentException");
            var arg = new Uint8Array(api_bytes.length + 1);
            arg[0] = api_bytes.length;
            for (var i = 0; i < api_bytes.length; i++) {
                arg[i + 1] = api_bytes[i];
            }
            return this.Emit(ThinNeo.OpCode.SYSCALL, arg);
        };
        ScriptBuilder.prototype.ToArray = function () {
            var array = new Uint8Array(this.writer.length);
            for (var i = 0; i < this.writer.length; i++) {
                array[i] = this.writer[i];
            }
            return array;
        };
        ScriptBuilder.prototype.EmitParamJson = function (param) {
            if (typeof param === "number") {
                this.EmitPushNumber(new Neo.BigInteger(param));
            }
            else if (typeof param === "boolean") {
                this.EmitPushBool(param);
            }
            else if (typeof param === "object") {
                var list = param;
                for (var i = list.length - 1; i >= 0; i--) {
                    this.EmitParamJson(list[i]);
                }
                this.EmitPushNumber(new Neo.BigInteger(list.length));
                this.Emit(ThinNeo.OpCode.PACK);
            }
            else if (typeof param === "string") {
                var str = param;
                if (str[0] != '(')
                    throw new Error("must start with:(str) or (hex) or (hexrev) or (addr)or(int)");
                if (str.indexOf("(string)") == 0) {
                    this.EmitPushString(str.substr(8));
                }
                if (str.indexOf("(str)") == 0) {
                    this.EmitPushString(str.substr(5));
                }
                else if (str.indexOf("(bytes)") == 0) {
                    var hex = str.substr(7).hexToBytes();
                    this.EmitPushBytes(hex);
                }
                else if (str.indexOf("([])") == 0) {
                    var hex = str.substr(4).hexToBytes();
                    this.EmitPushBytes(hex);
                }
                else if (str.indexOf("(address)") == 0) {
                    var addr = (str.substr(9));
                    var hex = ThinNeo.Helper.GetPublicKeyScriptHash_FromAddress(addr);
                    this.EmitPushBytes(hex);
                }
                else if (str.indexOf("(addr)") == 0) {
                    var addr = (str.substr(6));
                    var hex = ThinNeo.Helper.GetPublicKeyScriptHash_FromAddress(addr);
                    this.EmitPushBytes(hex);
                }
                else if (str.indexOf("(integer)") == 0) {
                    var num = new Neo.BigInteger(str.substr(9));
                    this.EmitPushNumber(num);
                }
                else if (str.indexOf("(int)") == 0) {
                    var num = new Neo.BigInteger(str.substr(5));
                    this.EmitPushNumber(num);
                }
                else if (str.indexOf("(hexinteger)") == 0) {
                    var hex = str.substr(12).hexToBytes();
                    this.EmitPushBytes(hex.reverse());
                }
                else if (str.indexOf("(hexint)") == 0) {
                    var hex = str.substr(8).hexToBytes();
                    this.EmitPushBytes(hex.reverse());
                }
                else if (str.indexOf("(hex)") == 0) {
                    var hex = str.substr(5).hexToBytes();
                    this.EmitPushBytes(hex.reverse());
                }
                else if (str.indexOf("(int256)") == 0 || str.indexOf("(hex256)") == 0) {
                    var hex = str.substr(8).hexToBytes();
                    if (hex.length != 32)
                        throw new Error("not a int256");
                    this.EmitPushBytes(hex.reverse());
                }
                else if (str.indexOf("(int160)") == 0 || str.indexOf("(hex160)") == 0) {
                    var hex = str.substr(8).hexToBytes();
                    if (hex.length != 20)
                        throw new Error("not a int160");
                    this.EmitPushBytes(hex.reverse());
                }
                else
                    throw new Error("must start with:(str) or (hex) or (hexbig) or (addr) or(int)");
            }
            else {
                throw new Error("error type:" + typeof param);
            }
            return this;
        };
        return ScriptBuilder;
    }());
    ThinNeo.ScriptBuilder = ScriptBuilder;
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var TransactionType;
    (function (TransactionType) {
        TransactionType[TransactionType["MinerTransaction"] = 0] = "MinerTransaction";
        TransactionType[TransactionType["IssueTransaction"] = 1] = "IssueTransaction";
        TransactionType[TransactionType["ClaimTransaction"] = 2] = "ClaimTransaction";
        TransactionType[TransactionType["EnrollmentTransaction"] = 32] = "EnrollmentTransaction";
        TransactionType[TransactionType["RegisterTransaction"] = 64] = "RegisterTransaction";
        TransactionType[TransactionType["ContractTransaction"] = 128] = "ContractTransaction";
        TransactionType[TransactionType["PublishTransaction"] = 208] = "PublishTransaction";
        TransactionType[TransactionType["InvocationTransaction"] = 209] = "InvocationTransaction";
    })(TransactionType = ThinNeo.TransactionType || (ThinNeo.TransactionType = {}));
    var TransactionAttributeUsage;
    (function (TransactionAttributeUsage) {
        TransactionAttributeUsage[TransactionAttributeUsage["ContractHash"] = 0] = "ContractHash";
        TransactionAttributeUsage[TransactionAttributeUsage["ECDH02"] = 2] = "ECDH02";
        TransactionAttributeUsage[TransactionAttributeUsage["ECDH03"] = 3] = "ECDH03";
        TransactionAttributeUsage[TransactionAttributeUsage["Script"] = 32] = "Script";
        TransactionAttributeUsage[TransactionAttributeUsage["Vote"] = 48] = "Vote";
        TransactionAttributeUsage[TransactionAttributeUsage["DescriptionUrl"] = 129] = "DescriptionUrl";
        TransactionAttributeUsage[TransactionAttributeUsage["Description"] = 144] = "Description";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash1"] = 161] = "Hash1";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash2"] = 162] = "Hash2";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash3"] = 163] = "Hash3";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash4"] = 164] = "Hash4";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash5"] = 165] = "Hash5";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash6"] = 166] = "Hash6";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash7"] = 167] = "Hash7";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash8"] = 168] = "Hash8";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash9"] = 169] = "Hash9";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash10"] = 170] = "Hash10";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash11"] = 171] = "Hash11";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash12"] = 172] = "Hash12";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash13"] = 173] = "Hash13";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash14"] = 174] = "Hash14";
        TransactionAttributeUsage[TransactionAttributeUsage["Hash15"] = 175] = "Hash15";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark"] = 240] = "Remark";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark1"] = 241] = "Remark1";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark2"] = 242] = "Remark2";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark3"] = 243] = "Remark3";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark4"] = 244] = "Remark4";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark5"] = 245] = "Remark5";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark6"] = 246] = "Remark6";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark7"] = 247] = "Remark7";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark8"] = 248] = "Remark8";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark9"] = 249] = "Remark9";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark10"] = 250] = "Remark10";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark11"] = 251] = "Remark11";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark12"] = 252] = "Remark12";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark13"] = 253] = "Remark13";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark14"] = 254] = "Remark14";
        TransactionAttributeUsage[TransactionAttributeUsage["Remark15"] = 255] = "Remark15";
    })(TransactionAttributeUsage = ThinNeo.TransactionAttributeUsage || (ThinNeo.TransactionAttributeUsage = {}));
    var Attribute = (function () {
        function Attribute() {
        }
        return Attribute;
    }());
    ThinNeo.Attribute = Attribute;
    var TransactionOutput = (function () {
        function TransactionOutput() {
        }
        return TransactionOutput;
    }());
    ThinNeo.TransactionOutput = TransactionOutput;
    var TransactionInput = (function () {
        function TransactionInput() {
        }
        return TransactionInput;
    }());
    ThinNeo.TransactionInput = TransactionInput;
    var Witness = (function () {
        function Witness() {
        }
        Object.defineProperty(Witness.prototype, "Address", {
            get: function () {
                var hash = ThinNeo.Helper.GetScriptHashFromScript(this.VerificationScript);
                return ThinNeo.Helper.GetAddressFromScriptHash(hash);
            },
            enumerable: true,
            configurable: true
        });
        return Witness;
    }());
    ThinNeo.Witness = Witness;
    var InvokeTransData = (function () {
        function InvokeTransData() {
        }
        InvokeTransData.prototype.Serialize = function (trans, writer) {
            writer.writeVarBytes(this.script.buffer);
            if (trans.version >= 1) {
                writer.writeUint64(this.gas.getData());
            }
        };
        InvokeTransData.prototype.Deserialize = function (trans, reader) {
            var buf = reader.readVarBytes(10000000);
            this.script = new Uint8Array(buf, 0, buf.byteLength);
            if (trans.version >= 1) {
                this.gas = new Neo.Fixed8(reader.readUint64());
            }
        };
        return InvokeTransData;
    }());
    ThinNeo.InvokeTransData = InvokeTransData;
    var ClaimTransData = (function () {
        function ClaimTransData() {
        }
        ClaimTransData.prototype.Serialize = function (trans, writer) {
            writer.writeVarInt(this.claims.length);
            for (var i = 0; i < this.claims.length; i++) {
                writer.write(this.claims[i].hash, 0, 32);
                writer.writeUint16(this.claims[i].index);
            }
        };
        ClaimTransData.prototype.Deserialize = function (trans, reader) {
            var countClaims = reader.readVarInt();
            this.claims = [];
            for (var i = 0; i < countClaims; i++) {
                this.claims.push(new TransactionInput());
                var arr = reader.readBytes(32);
                this.claims[i].hash = new Uint8Array(arr, 0, arr.byteLength);
                this.claims[i].index = reader.readUint16();
            }
        };
        return ClaimTransData;
    }());
    ThinNeo.ClaimTransData = ClaimTransData;
    var MinerTransData = (function () {
        function MinerTransData() {
        }
        MinerTransData.prototype.Serialize = function (trans, writer) {
            writer.writeUint32(this.nonce);
        };
        MinerTransData.prototype.Deserialize = function (trans, reader) {
            this.nonce = reader.readUint32();
        };
        return MinerTransData;
    }());
    ThinNeo.MinerTransData = MinerTransData;
    var Transaction = (function () {
        function Transaction() {
        }
        Transaction.prototype.SerializeUnsigned = function (writer) {
            writer.writeByte(this.type);
            writer.writeByte(this.version);
            if (this.type == TransactionType.ContractTransaction ||
                this.type == TransactionType.IssueTransaction) {
            }
            else if (this.type == TransactionType.InvocationTransaction) {
                this.extdata.Serialize(this, writer);
            }
            else if (this.type == TransactionType.ClaimTransaction) {
                this.extdata.Serialize(this, writer);
            }
            else if (this.type == TransactionType.MinerTransaction) {
                this.extdata.Serialize(this, writer);
            }
            else {
                throw new Error("未编写针对这个交易类型的代码");
            }
            var countAttributes = this.attributes.length;
            writer.writeVarInt(countAttributes);
            for (var i = 0; i < countAttributes; i++) {
                var attributeData = this.attributes[i].data;
                var Usage = this.attributes[i].usage;
                writer.writeByte(Usage);
                if (Usage == TransactionAttributeUsage.ContractHash || Usage == TransactionAttributeUsage.Vote || (Usage >= TransactionAttributeUsage.Hash1 && Usage <= TransactionAttributeUsage.Hash15)) {
                    writer.write(attributeData.buffer, 0, 32);
                }
                else if (Usage == TransactionAttributeUsage.ECDH02 || Usage == TransactionAttributeUsage.ECDH03) {
                    writer.write(attributeData.buffer, 1, 32);
                }
                else if (Usage == TransactionAttributeUsage.Script) {
                    writer.write(attributeData.buffer, 0, 20);
                }
                else if (Usage == TransactionAttributeUsage.DescriptionUrl) {
                    var len = attributeData.length;
                    writer.writeByte(len);
                    writer.write(attributeData.buffer, 0, len);
                }
                else if (Usage == TransactionAttributeUsage.Description || Usage >= TransactionAttributeUsage.Remark) {
                    var len = attributeData.length;
                    writer.writeVarInt(len);
                    writer.write(attributeData.buffer, 0, len);
                }
                else
                    throw new Error();
            }
            var countInputs = this.inputs.length;
            writer.writeVarInt(countInputs);
            for (var i = 0; i < countInputs; i++) {
                writer.write(this.inputs[i].hash, 0, 32);
                writer.writeUint16(this.inputs[i].index);
            }
            var countOutputs = this.outputs.length;
            writer.writeVarInt(countOutputs);
            for (var i = 0; i < countOutputs; i++) {
                var item = this.outputs[i];
                writer.write(item.assetId.buffer, 0, 32);
                writer.writeUint64(item.value.getData());
                writer.write(item.toAddress.buffer, 0, 20);
            }
        };
        Transaction.prototype.Serialize = function (writer) {
            this.SerializeUnsigned(writer);
            var witnesscount = this.witnesses.length;
            writer.writeVarInt(witnesscount);
            for (var i = 0; i < witnesscount; i++) {
                var _witness = this.witnesses[i];
                writer.writeVarBytes(_witness.InvocationScript.buffer);
                writer.writeVarBytes(_witness.VerificationScript.buffer);
            }
        };
        Transaction.prototype.DeserializeUnsigned = function (ms) {
            this.type = ms.readByte();
            this.version = ms.readByte();
            if (this.type == TransactionType.ContractTransaction
                || this.type == TransactionType.IssueTransaction) {
                this.extdata = null;
            }
            else if (this.type == TransactionType.InvocationTransaction) {
                this.extdata = new InvokeTransData();
            }
            else if (this.type == TransactionType.ClaimTransaction) {
                this.extdata = new ClaimTransData();
            }
            else if (this.type == TransactionType.MinerTransaction) {
                this.extdata = new MinerTransData();
            }
            else {
                throw new Error("未编写针对这个交易类型的代码");
            }
            if (this.extdata != null) {
                this.extdata.Deserialize(this, ms);
            }
            var countAttributes = ms.readVarInt();
            this.attributes = [];
            for (var i = 0; i < countAttributes; i++) {
                var attributeData = null;
                var Usage = ms.readByte();
                if (Usage == TransactionAttributeUsage.ContractHash || Usage == TransactionAttributeUsage.Vote || (Usage >= TransactionAttributeUsage.Hash1 && Usage <= TransactionAttributeUsage.Hash15)) {
                    var arr = ms.readBytes(32);
                    attributeData = new Uint8Array(arr, 0, arr.byteLength);
                }
                else if (Usage == TransactionAttributeUsage.ECDH02 || Usage == TransactionAttributeUsage.ECDH03) {
                    var arr = ms.readBytes(32);
                    var data = new Uint8Array(arr, 0, arr.byteLength);
                    attributeData = new Uint8Array(33);
                    attributeData[0] = Usage;
                    for (var i = 0; i < 32; i++) {
                        attributeData[i + 1] = data[i];
                    }
                }
                else if (Usage == TransactionAttributeUsage.Script) {
                    var arr = ms.readBytes(20);
                    attributeData = new Uint8Array(arr, 0, arr.byteLength);
                }
                else if (Usage == TransactionAttributeUsage.DescriptionUrl) {
                    var len = ms.readByte();
                    var arr = ms.readBytes(len);
                    attributeData = new Uint8Array(arr, 0, arr.byteLength);
                }
                else if (Usage == TransactionAttributeUsage.Description || Usage >= TransactionAttributeUsage.Remark) {
                    var len = ms.readVarInt(65535);
                    var arr = ms.readBytes(len);
                    attributeData = new Uint8Array(arr, 0, arr.byteLength);
                }
                else
                    throw new Error();
                var attr = new Attribute();
                attr.usage = Usage;
                attr.data = attributeData;
                this.attributes.push(attr);
            }
            var countInputs = ms.readVarInt();
            this.inputs = [];
            for (var i = 0; i < countInputs; i++) {
                this.inputs.push(new TransactionInput());
                var arr = ms.readBytes(32);
                this.inputs[i].hash = new Uint8Array(arr, 0, arr.byteLength);
                this.inputs[i].index = ms.readUint16();
            }
            var countOutputs = ms.readVarInt();
            this.outputs = [];
            for (var i = 0; i < countOutputs; i++) {
                this.outputs.push(new TransactionOutput());
                var outp = this.outputs[i];
                var arr = ms.readBytes(32);
                var assetid = new Uint8Array(arr, 0, arr.byteLength);
                var value = new Neo.Fixed8(ms.readUint64());
                var arr = ms.readBytes(20);
                var scripthash = new Uint8Array(arr, 0, arr.byteLength);
                outp.assetId = assetid;
                outp.value = value;
                outp.toAddress = scripthash;
                this.outputs[i] = outp;
            }
        };
        Transaction.prototype.Deserialize = function (ms) {
            this.DeserializeUnsigned(ms);
            if (ms.canRead() > 0) {
                var witnesscount = ms.readVarInt();
                this.witnesses = [];
                for (var i = 0; i < witnesscount; i++) {
                    this.witnesses.push(new Witness());
                    this.witnesses[i].InvocationScript = new Uint8Array(ms.readVarBytes()).clone();
                    this.witnesses[i].VerificationScript = new Uint8Array(ms.readVarBytes()).clone();
                }
            }
        };
        Transaction.prototype.GetMessage = function () {
            var ms = new Neo.IO.MemoryStream();
            var writer = new Neo.IO.BinaryWriter(ms);
            this.SerializeUnsigned(writer);
            var arr = ms.toArray();
            var msg = new Uint8Array(arr, 0, arr.byteLength);
            return msg;
        };
        Transaction.prototype.GetRawData = function () {
            var ms = new Neo.IO.MemoryStream();
            var writer = new Neo.IO.BinaryWriter(ms);
            this.Serialize(writer);
            var arr = ms.toArray();
            var msg = new Uint8Array(arr, 0, arr.byteLength);
            return msg;
        };
        Transaction.prototype.AddWitness = function (signdata, pubkey, addrs) {
            {
                var msg = this.GetMessage();
                var bsign = ThinNeo.Helper.VerifySignature(msg, signdata, pubkey);
                if (bsign == false)
                    throw new Error("wrong sign");
                var addr = ThinNeo.Helper.GetAddressFromPublicKey(pubkey);
                if (addr != addrs)
                    throw new Error("wrong script");
            }
            var vscript = ThinNeo.Helper.GetAddressCheckScriptFromPublicKey(pubkey);
            var sb = new ThinNeo.ScriptBuilder();
            sb.EmitPushBytes(signdata);
            var iscript = sb.ToArray();
            this.AddWitnessScript(vscript, iscript);
        };
        Transaction.prototype.AddWitnessScript = function (vscript, iscript) {
            var scripthash = ThinNeo.Helper.GetScriptHashFromScript(vscript);
            if (this.witnesses == null)
                this.witnesses = [];
            var newwit = new Witness();
            newwit.VerificationScript = vscript;
            newwit.InvocationScript = iscript;
            for (var i = 0; i < this.witnesses.length; i++) {
                if (this.witnesses[i].Address == newwit.Address)
                    throw new Error("alread have this witness");
            }
            var _witnesses;
            if (this.witnesses)
                _witnesses = this.witnesses;
            else
                _witnesses = [];
            _witnesses.push(newwit);
            _witnesses.sort(function (a, b) {
                var hash_a = ThinNeo.Helper.GetScriptHashFromScript(a.VerificationScript);
                var hash_b = ThinNeo.Helper.GetScriptHashFromScript(b.VerificationScript);
                for (var i_4 = (hash_a.length - 1); i_4 >= 0; i_4--) {
                    if (hash_a[i_4] > hash_b[i_4])
                        return 1;
                    if (hash_a[i_4] < hash_b[i_4])
                        return -1;
                }
                return 0;
            });
            this.witnesses = _witnesses;
        };
        Transaction.prototype.GetHash = function () {
            var msg = this.GetMessage();
            var data = Neo.Cryptography.Sha256.computeHash(msg);
            data = Neo.Cryptography.Sha256.computeHash(data);
            return new Uint8Array(data, 0, data.byteLength);
        };
        return Transaction;
    }());
    ThinNeo.Transaction = Transaction;
})(ThinNeo || (ThinNeo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var Aes = (function () {
            function Aes(key, iv) {
                this._Ke = [];
                this._Kd = [];
                this._lastCipherblock = new Uint8Array(16);
                var rounds = Aes.numberOfRounds[key.byteLength];
                if (rounds == null) {
                    throw new RangeError('invalid key size (must be length 16, 24 or 32)');
                }
                if (iv.byteLength != 16) {
                    throw new RangeError('initialation vector iv must be of length 16');
                }
                for (var i = 0; i <= rounds; i++) {
                    this._Ke.push([0, 0, 0, 0]);
                    this._Kd.push([0, 0, 0, 0]);
                }
                var roundKeyCount = (rounds + 1) * 4;
                var KC = key.byteLength / 4;
                var tk = Aes.convertToInt32(Uint8Array.fromArrayBuffer(key));
                var index;
                for (var i = 0; i < KC; i++) {
                    index = i >> 2;
                    this._Ke[index][i % 4] = tk[i];
                    this._Kd[rounds - index][i % 4] = tk[i];
                }
                var rconpointer = 0;
                var t = KC, tt;
                while (t < roundKeyCount) {
                    tt = tk[KC - 1];
                    tk[0] ^= ((Aes.S[(tt >> 16) & 0xFF] << 24) ^
                        (Aes.S[(tt >> 8) & 0xFF] << 16) ^
                        (Aes.S[tt & 0xFF] << 8) ^
                        Aes.S[(tt >> 24) & 0xFF] ^
                        (Aes.rcon[rconpointer] << 24));
                    rconpointer += 1;
                    if (KC != 8) {
                        for (var i = 1; i < KC; i++) {
                            tk[i] ^= tk[i - 1];
                        }
                    }
                    else {
                        for (var i = 1; i < (KC / 2); i++) {
                            tk[i] ^= tk[i - 1];
                        }
                        tt = tk[(KC / 2) - 1];
                        tk[KC / 2] ^= (Aes.S[tt & 0xFF] ^
                            (Aes.S[(tt >> 8) & 0xFF] << 8) ^
                            (Aes.S[(tt >> 16) & 0xFF] << 16) ^
                            (Aes.S[(tt >> 24) & 0xFF] << 24));
                        for (var i = (KC / 2) + 1; i < KC; i++) {
                            tk[i] ^= tk[i - 1];
                        }
                    }
                    var i = 0;
                    while (i < KC && t < roundKeyCount) {
                        var r_1 = t >> 2;
                        var c_1 = t % 4;
                        this._Ke[r_1][c_1] = tk[i];
                        this._Kd[rounds - r_1][c_1] = tk[i++];
                        t++;
                    }
                }
                for (var r = 1; r < rounds; r++) {
                    for (var c = 0; c < 4; c++) {
                        tt = this._Kd[r][c];
                        this._Kd[r][c] = (Aes.U1[(tt >> 24) & 0xFF] ^
                            Aes.U2[(tt >> 16) & 0xFF] ^
                            Aes.U3[(tt >> 8) & 0xFF] ^
                            Aes.U4[tt & 0xFF]);
                    }
                }
                this._lastCipherblock.set(Uint8Array.fromArrayBuffer(iv));
            }
            Object.defineProperty(Aes.prototype, "mode", {
                get: function () {
                    return "CBC";
                },
                enumerable: true,
                configurable: true
            });
            Aes.convertToInt32 = function (bytes) {
                var result = [];
                for (var i = 0; i < bytes.length; i += 4) {
                    result.push((bytes[i] << 24) |
                        (bytes[i + 1] << 16) |
                        (bytes[i + 2] << 8) |
                        bytes[i + 3]);
                }
                return result;
            };
            Aes.prototype.decrypt = function (ciphertext) {
                if (ciphertext.byteLength == 0 || ciphertext.byteLength % 16 != 0)
                    throw new RangeError();
                var plaintext = new Uint8Array(ciphertext.byteLength);
                var ciphertext_view = Uint8Array.fromArrayBuffer(ciphertext);
                for (var i = 0; i < ciphertext_view.length; i += 16)
                    this.decryptBlock(ciphertext_view.subarray(i, i + 16), plaintext.subarray(i, i + 16));
                return plaintext.buffer.slice(0, plaintext.length - plaintext[plaintext.length - 1]);
            };
            Aes.prototype.decryptBlock = function (ciphertext, plaintext) {
                if (ciphertext.length != 16 || plaintext.length != 16)
                    throw new RangeError();
                var rounds = this._Kd.length - 1;
                var a = [0, 0, 0, 0];
                var t = Aes.convertToInt32(ciphertext);
                for (var i = 0; i < 4; i++) {
                    t[i] ^= this._Kd[0][i];
                }
                for (var r = 1; r < rounds; r++) {
                    for (var i = 0; i < 4; i++) {
                        a[i] = (Aes.T5[(t[i] >> 24) & 0xff] ^
                            Aes.T6[(t[(i + 3) % 4] >> 16) & 0xff] ^
                            Aes.T7[(t[(i + 2) % 4] >> 8) & 0xff] ^
                            Aes.T8[t[(i + 1) % 4] & 0xff] ^
                            this._Kd[r][i]);
                    }
                    t = a.slice(0);
                }
                for (var i = 0; i < 4; i++) {
                    var tt = this._Kd[rounds][i];
                    plaintext[4 * i] = (Aes.Si[(t[i] >> 24) & 0xff] ^ (tt >> 24)) & 0xff;
                    plaintext[4 * i + 1] = (Aes.Si[(t[(i + 3) % 4] >> 16) & 0xff] ^ (tt >> 16)) & 0xff;
                    plaintext[4 * i + 2] = (Aes.Si[(t[(i + 2) % 4] >> 8) & 0xff] ^ (tt >> 8)) & 0xff;
                    plaintext[4 * i + 3] = (Aes.Si[t[(i + 1) % 4] & 0xff] ^ tt) & 0xff;
                }
                for (var i = 0; i < 16; i++) {
                    plaintext[i] ^= this._lastCipherblock[i];
                }
                Array.copy(ciphertext, 0, this._lastCipherblock, 0, ciphertext.length);
            };
            Aes.prototype.encrypt = function (plaintext) {
                var block_count = Math.ceil((plaintext.byteLength + 1) / 16);
                var ciphertext = new Uint8Array(block_count * 16);
                var plaintext_view = Uint8Array.fromArrayBuffer(plaintext);
                for (var i = 0; i < block_count - 1; i++)
                    this.encryptBlock(plaintext_view.subarray(i * 16, (i + 1) * 16), ciphertext.subarray(i * 16, (i + 1) * 16));
                var padding = ciphertext.length - plaintext.byteLength;
                var final_block = new Uint8Array(16);
                final_block.fill(padding);
                if (padding < 16)
                    Array.copy(plaintext_view, ciphertext.length - 16, final_block, 0, 16 - padding);
                this.encryptBlock(final_block, ciphertext.subarray(ciphertext.length - 16));
                return ciphertext.buffer;
            };
            Aes.prototype.encryptBlock = function (plaintext, ciphertext) {
                if (plaintext.length != 16 || ciphertext.length != 16)
                    throw new RangeError();
                var precipherblock = new Uint8Array(plaintext.length);
                for (var i = 0; i < precipherblock.length; i++) {
                    precipherblock[i] = plaintext[i] ^ this._lastCipherblock[i];
                }
                var rounds = this._Ke.length - 1;
                var a = [0, 0, 0, 0];
                var t = Aes.convertToInt32(precipherblock);
                for (var i = 0; i < 4; i++) {
                    t[i] ^= this._Ke[0][i];
                }
                for (var r = 1; r < rounds; r++) {
                    for (var i = 0; i < 4; i++) {
                        a[i] = (Aes.T1[(t[i] >> 24) & 0xff] ^
                            Aes.T2[(t[(i + 1) % 4] >> 16) & 0xff] ^
                            Aes.T3[(t[(i + 2) % 4] >> 8) & 0xff] ^
                            Aes.T4[t[(i + 3) % 4] & 0xff] ^
                            this._Ke[r][i]);
                    }
                    t = a.slice(0);
                }
                for (var i = 0; i < 4; i++) {
                    var tt = this._Ke[rounds][i];
                    ciphertext[4 * i] = (Aes.S[(t[i] >> 24) & 0xff] ^ (tt >> 24)) & 0xff;
                    ciphertext[4 * i + 1] = (Aes.S[(t[(i + 1) % 4] >> 16) & 0xff] ^ (tt >> 16)) & 0xff;
                    ciphertext[4 * i + 2] = (Aes.S[(t[(i + 2) % 4] >> 8) & 0xff] ^ (tt >> 8)) & 0xff;
                    ciphertext[4 * i + 3] = (Aes.S[t[(i + 3) % 4] & 0xff] ^ tt) & 0xff;
                }
                Array.copy(ciphertext, 0, this._lastCipherblock, 0, ciphertext.length);
            };
            Aes.numberOfRounds = { 16: 10, 24: 12, 32: 14 };
            Aes.rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5, 0x91];
            Aes.S = [0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15, 0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf, 0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73, 0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08, 0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a, 0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf, 0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16];
            Aes.Si = [0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb, 0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb, 0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e, 0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25, 0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92, 0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84, 0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06, 0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b, 0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73, 0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e, 0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b, 0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4, 0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f, 0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef, 0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61, 0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d];
            Aes.T1 = [0xc66363a5, 0xf87c7c84, 0xee777799, 0xf67b7b8d, 0xfff2f20d, 0xd66b6bbd, 0xde6f6fb1, 0x91c5c554, 0x60303050, 0x02010103, 0xce6767a9, 0x562b2b7d, 0xe7fefe19, 0xb5d7d762, 0x4dababe6, 0xec76769a, 0x8fcaca45, 0x1f82829d, 0x89c9c940, 0xfa7d7d87, 0xeffafa15, 0xb25959eb, 0x8e4747c9, 0xfbf0f00b, 0x41adadec, 0xb3d4d467, 0x5fa2a2fd, 0x45afafea, 0x239c9cbf, 0x53a4a4f7, 0xe4727296, 0x9bc0c05b, 0x75b7b7c2, 0xe1fdfd1c, 0x3d9393ae, 0x4c26266a, 0x6c36365a, 0x7e3f3f41, 0xf5f7f702, 0x83cccc4f, 0x6834345c, 0x51a5a5f4, 0xd1e5e534, 0xf9f1f108, 0xe2717193, 0xabd8d873, 0x62313153, 0x2a15153f, 0x0804040c, 0x95c7c752, 0x46232365, 0x9dc3c35e, 0x30181828, 0x379696a1, 0x0a05050f, 0x2f9a9ab5, 0x0e070709, 0x24121236, 0x1b80809b, 0xdfe2e23d, 0xcdebeb26, 0x4e272769, 0x7fb2b2cd, 0xea75759f, 0x1209091b, 0x1d83839e, 0x582c2c74, 0x341a1a2e, 0x361b1b2d, 0xdc6e6eb2, 0xb45a5aee, 0x5ba0a0fb, 0xa45252f6, 0x763b3b4d, 0xb7d6d661, 0x7db3b3ce, 0x5229297b, 0xdde3e33e, 0x5e2f2f71, 0x13848497, 0xa65353f5, 0xb9d1d168, 0x00000000, 0xc1eded2c, 0x40202060, 0xe3fcfc1f, 0x79b1b1c8, 0xb65b5bed, 0xd46a6abe, 0x8dcbcb46, 0x67bebed9, 0x7239394b, 0x944a4ade, 0x984c4cd4, 0xb05858e8, 0x85cfcf4a, 0xbbd0d06b, 0xc5efef2a, 0x4faaaae5, 0xedfbfb16, 0x864343c5, 0x9a4d4dd7, 0x66333355, 0x11858594, 0x8a4545cf, 0xe9f9f910, 0x04020206, 0xfe7f7f81, 0xa05050f0, 0x783c3c44, 0x259f9fba, 0x4ba8a8e3, 0xa25151f3, 0x5da3a3fe, 0x804040c0, 0x058f8f8a, 0x3f9292ad, 0x219d9dbc, 0x70383848, 0xf1f5f504, 0x63bcbcdf, 0x77b6b6c1, 0xafdada75, 0x42212163, 0x20101030, 0xe5ffff1a, 0xfdf3f30e, 0xbfd2d26d, 0x81cdcd4c, 0x180c0c14, 0x26131335, 0xc3ecec2f, 0xbe5f5fe1, 0x359797a2, 0x884444cc, 0x2e171739, 0x93c4c457, 0x55a7a7f2, 0xfc7e7e82, 0x7a3d3d47, 0xc86464ac, 0xba5d5de7, 0x3219192b, 0xe6737395, 0xc06060a0, 0x19818198, 0x9e4f4fd1, 0xa3dcdc7f, 0x44222266, 0x542a2a7e, 0x3b9090ab, 0x0b888883, 0x8c4646ca, 0xc7eeee29, 0x6bb8b8d3, 0x2814143c, 0xa7dede79, 0xbc5e5ee2, 0x160b0b1d, 0xaddbdb76, 0xdbe0e03b, 0x64323256, 0x743a3a4e, 0x140a0a1e, 0x924949db, 0x0c06060a, 0x4824246c, 0xb85c5ce4, 0x9fc2c25d, 0xbdd3d36e, 0x43acacef, 0xc46262a6, 0x399191a8, 0x319595a4, 0xd3e4e437, 0xf279798b, 0xd5e7e732, 0x8bc8c843, 0x6e373759, 0xda6d6db7, 0x018d8d8c, 0xb1d5d564, 0x9c4e4ed2, 0x49a9a9e0, 0xd86c6cb4, 0xac5656fa, 0xf3f4f407, 0xcfeaea25, 0xca6565af, 0xf47a7a8e, 0x47aeaee9, 0x10080818, 0x6fbabad5, 0xf0787888, 0x4a25256f, 0x5c2e2e72, 0x381c1c24, 0x57a6a6f1, 0x73b4b4c7, 0x97c6c651, 0xcbe8e823, 0xa1dddd7c, 0xe874749c, 0x3e1f1f21, 0x964b4bdd, 0x61bdbddc, 0x0d8b8b86, 0x0f8a8a85, 0xe0707090, 0x7c3e3e42, 0x71b5b5c4, 0xcc6666aa, 0x904848d8, 0x06030305, 0xf7f6f601, 0x1c0e0e12, 0xc26161a3, 0x6a35355f, 0xae5757f9, 0x69b9b9d0, 0x17868691, 0x99c1c158, 0x3a1d1d27, 0x279e9eb9, 0xd9e1e138, 0xebf8f813, 0x2b9898b3, 0x22111133, 0xd26969bb, 0xa9d9d970, 0x078e8e89, 0x339494a7, 0x2d9b9bb6, 0x3c1e1e22, 0x15878792, 0xc9e9e920, 0x87cece49, 0xaa5555ff, 0x50282878, 0xa5dfdf7a, 0x038c8c8f, 0x59a1a1f8, 0x09898980, 0x1a0d0d17, 0x65bfbfda, 0xd7e6e631, 0x844242c6, 0xd06868b8, 0x824141c3, 0x299999b0, 0x5a2d2d77, 0x1e0f0f11, 0x7bb0b0cb, 0xa85454fc, 0x6dbbbbd6, 0x2c16163a];
            Aes.T2 = [0xa5c66363, 0x84f87c7c, 0x99ee7777, 0x8df67b7b, 0x0dfff2f2, 0xbdd66b6b, 0xb1de6f6f, 0x5491c5c5, 0x50603030, 0x03020101, 0xa9ce6767, 0x7d562b2b, 0x19e7fefe, 0x62b5d7d7, 0xe64dabab, 0x9aec7676, 0x458fcaca, 0x9d1f8282, 0x4089c9c9, 0x87fa7d7d, 0x15effafa, 0xebb25959, 0xc98e4747, 0x0bfbf0f0, 0xec41adad, 0x67b3d4d4, 0xfd5fa2a2, 0xea45afaf, 0xbf239c9c, 0xf753a4a4, 0x96e47272, 0x5b9bc0c0, 0xc275b7b7, 0x1ce1fdfd, 0xae3d9393, 0x6a4c2626, 0x5a6c3636, 0x417e3f3f, 0x02f5f7f7, 0x4f83cccc, 0x5c683434, 0xf451a5a5, 0x34d1e5e5, 0x08f9f1f1, 0x93e27171, 0x73abd8d8, 0x53623131, 0x3f2a1515, 0x0c080404, 0x5295c7c7, 0x65462323, 0x5e9dc3c3, 0x28301818, 0xa1379696, 0x0f0a0505, 0xb52f9a9a, 0x090e0707, 0x36241212, 0x9b1b8080, 0x3ddfe2e2, 0x26cdebeb, 0x694e2727, 0xcd7fb2b2, 0x9fea7575, 0x1b120909, 0x9e1d8383, 0x74582c2c, 0x2e341a1a, 0x2d361b1b, 0xb2dc6e6e, 0xeeb45a5a, 0xfb5ba0a0, 0xf6a45252, 0x4d763b3b, 0x61b7d6d6, 0xce7db3b3, 0x7b522929, 0x3edde3e3, 0x715e2f2f, 0x97138484, 0xf5a65353, 0x68b9d1d1, 0x00000000, 0x2cc1eded, 0x60402020, 0x1fe3fcfc, 0xc879b1b1, 0xedb65b5b, 0xbed46a6a, 0x468dcbcb, 0xd967bebe, 0x4b723939, 0xde944a4a, 0xd4984c4c, 0xe8b05858, 0x4a85cfcf, 0x6bbbd0d0, 0x2ac5efef, 0xe54faaaa, 0x16edfbfb, 0xc5864343, 0xd79a4d4d, 0x55663333, 0x94118585, 0xcf8a4545, 0x10e9f9f9, 0x06040202, 0x81fe7f7f, 0xf0a05050, 0x44783c3c, 0xba259f9f, 0xe34ba8a8, 0xf3a25151, 0xfe5da3a3, 0xc0804040, 0x8a058f8f, 0xad3f9292, 0xbc219d9d, 0x48703838, 0x04f1f5f5, 0xdf63bcbc, 0xc177b6b6, 0x75afdada, 0x63422121, 0x30201010, 0x1ae5ffff, 0x0efdf3f3, 0x6dbfd2d2, 0x4c81cdcd, 0x14180c0c, 0x35261313, 0x2fc3ecec, 0xe1be5f5f, 0xa2359797, 0xcc884444, 0x392e1717, 0x5793c4c4, 0xf255a7a7, 0x82fc7e7e, 0x477a3d3d, 0xacc86464, 0xe7ba5d5d, 0x2b321919, 0x95e67373, 0xa0c06060, 0x98198181, 0xd19e4f4f, 0x7fa3dcdc, 0x66442222, 0x7e542a2a, 0xab3b9090, 0x830b8888, 0xca8c4646, 0x29c7eeee, 0xd36bb8b8, 0x3c281414, 0x79a7dede, 0xe2bc5e5e, 0x1d160b0b, 0x76addbdb, 0x3bdbe0e0, 0x56643232, 0x4e743a3a, 0x1e140a0a, 0xdb924949, 0x0a0c0606, 0x6c482424, 0xe4b85c5c, 0x5d9fc2c2, 0x6ebdd3d3, 0xef43acac, 0xa6c46262, 0xa8399191, 0xa4319595, 0x37d3e4e4, 0x8bf27979, 0x32d5e7e7, 0x438bc8c8, 0x596e3737, 0xb7da6d6d, 0x8c018d8d, 0x64b1d5d5, 0xd29c4e4e, 0xe049a9a9, 0xb4d86c6c, 0xfaac5656, 0x07f3f4f4, 0x25cfeaea, 0xafca6565, 0x8ef47a7a, 0xe947aeae, 0x18100808, 0xd56fbaba, 0x88f07878, 0x6f4a2525, 0x725c2e2e, 0x24381c1c, 0xf157a6a6, 0xc773b4b4, 0x5197c6c6, 0x23cbe8e8, 0x7ca1dddd, 0x9ce87474, 0x213e1f1f, 0xdd964b4b, 0xdc61bdbd, 0x860d8b8b, 0x850f8a8a, 0x90e07070, 0x427c3e3e, 0xc471b5b5, 0xaacc6666, 0xd8904848, 0x05060303, 0x01f7f6f6, 0x121c0e0e, 0xa3c26161, 0x5f6a3535, 0xf9ae5757, 0xd069b9b9, 0x91178686, 0x5899c1c1, 0x273a1d1d, 0xb9279e9e, 0x38d9e1e1, 0x13ebf8f8, 0xb32b9898, 0x33221111, 0xbbd26969, 0x70a9d9d9, 0x89078e8e, 0xa7339494, 0xb62d9b9b, 0x223c1e1e, 0x92158787, 0x20c9e9e9, 0x4987cece, 0xffaa5555, 0x78502828, 0x7aa5dfdf, 0x8f038c8c, 0xf859a1a1, 0x80098989, 0x171a0d0d, 0xda65bfbf, 0x31d7e6e6, 0xc6844242, 0xb8d06868, 0xc3824141, 0xb0299999, 0x775a2d2d, 0x111e0f0f, 0xcb7bb0b0, 0xfca85454, 0xd66dbbbb, 0x3a2c1616];
            Aes.T3 = [0x63a5c663, 0x7c84f87c, 0x7799ee77, 0x7b8df67b, 0xf20dfff2, 0x6bbdd66b, 0x6fb1de6f, 0xc55491c5, 0x30506030, 0x01030201, 0x67a9ce67, 0x2b7d562b, 0xfe19e7fe, 0xd762b5d7, 0xabe64dab, 0x769aec76, 0xca458fca, 0x829d1f82, 0xc94089c9, 0x7d87fa7d, 0xfa15effa, 0x59ebb259, 0x47c98e47, 0xf00bfbf0, 0xadec41ad, 0xd467b3d4, 0xa2fd5fa2, 0xafea45af, 0x9cbf239c, 0xa4f753a4, 0x7296e472, 0xc05b9bc0, 0xb7c275b7, 0xfd1ce1fd, 0x93ae3d93, 0x266a4c26, 0x365a6c36, 0x3f417e3f, 0xf702f5f7, 0xcc4f83cc, 0x345c6834, 0xa5f451a5, 0xe534d1e5, 0xf108f9f1, 0x7193e271, 0xd873abd8, 0x31536231, 0x153f2a15, 0x040c0804, 0xc75295c7, 0x23654623, 0xc35e9dc3, 0x18283018, 0x96a13796, 0x050f0a05, 0x9ab52f9a, 0x07090e07, 0x12362412, 0x809b1b80, 0xe23ddfe2, 0xeb26cdeb, 0x27694e27, 0xb2cd7fb2, 0x759fea75, 0x091b1209, 0x839e1d83, 0x2c74582c, 0x1a2e341a, 0x1b2d361b, 0x6eb2dc6e, 0x5aeeb45a, 0xa0fb5ba0, 0x52f6a452, 0x3b4d763b, 0xd661b7d6, 0xb3ce7db3, 0x297b5229, 0xe33edde3, 0x2f715e2f, 0x84971384, 0x53f5a653, 0xd168b9d1, 0x00000000, 0xed2cc1ed, 0x20604020, 0xfc1fe3fc, 0xb1c879b1, 0x5bedb65b, 0x6abed46a, 0xcb468dcb, 0xbed967be, 0x394b7239, 0x4ade944a, 0x4cd4984c, 0x58e8b058, 0xcf4a85cf, 0xd06bbbd0, 0xef2ac5ef, 0xaae54faa, 0xfb16edfb, 0x43c58643, 0x4dd79a4d, 0x33556633, 0x85941185, 0x45cf8a45, 0xf910e9f9, 0x02060402, 0x7f81fe7f, 0x50f0a050, 0x3c44783c, 0x9fba259f, 0xa8e34ba8, 0x51f3a251, 0xa3fe5da3, 0x40c08040, 0x8f8a058f, 0x92ad3f92, 0x9dbc219d, 0x38487038, 0xf504f1f5, 0xbcdf63bc, 0xb6c177b6, 0xda75afda, 0x21634221, 0x10302010, 0xff1ae5ff, 0xf30efdf3, 0xd26dbfd2, 0xcd4c81cd, 0x0c14180c, 0x13352613, 0xec2fc3ec, 0x5fe1be5f, 0x97a23597, 0x44cc8844, 0x17392e17, 0xc45793c4, 0xa7f255a7, 0x7e82fc7e, 0x3d477a3d, 0x64acc864, 0x5de7ba5d, 0x192b3219, 0x7395e673, 0x60a0c060, 0x81981981, 0x4fd19e4f, 0xdc7fa3dc, 0x22664422, 0x2a7e542a, 0x90ab3b90, 0x88830b88, 0x46ca8c46, 0xee29c7ee, 0xb8d36bb8, 0x143c2814, 0xde79a7de, 0x5ee2bc5e, 0x0b1d160b, 0xdb76addb, 0xe03bdbe0, 0x32566432, 0x3a4e743a, 0x0a1e140a, 0x49db9249, 0x060a0c06, 0x246c4824, 0x5ce4b85c, 0xc25d9fc2, 0xd36ebdd3, 0xacef43ac, 0x62a6c462, 0x91a83991, 0x95a43195, 0xe437d3e4, 0x798bf279, 0xe732d5e7, 0xc8438bc8, 0x37596e37, 0x6db7da6d, 0x8d8c018d, 0xd564b1d5, 0x4ed29c4e, 0xa9e049a9, 0x6cb4d86c, 0x56faac56, 0xf407f3f4, 0xea25cfea, 0x65afca65, 0x7a8ef47a, 0xaee947ae, 0x08181008, 0xbad56fba, 0x7888f078, 0x256f4a25, 0x2e725c2e, 0x1c24381c, 0xa6f157a6, 0xb4c773b4, 0xc65197c6, 0xe823cbe8, 0xdd7ca1dd, 0x749ce874, 0x1f213e1f, 0x4bdd964b, 0xbddc61bd, 0x8b860d8b, 0x8a850f8a, 0x7090e070, 0x3e427c3e, 0xb5c471b5, 0x66aacc66, 0x48d89048, 0x03050603, 0xf601f7f6, 0x0e121c0e, 0x61a3c261, 0x355f6a35, 0x57f9ae57, 0xb9d069b9, 0x86911786, 0xc15899c1, 0x1d273a1d, 0x9eb9279e, 0xe138d9e1, 0xf813ebf8, 0x98b32b98, 0x11332211, 0x69bbd269, 0xd970a9d9, 0x8e89078e, 0x94a73394, 0x9bb62d9b, 0x1e223c1e, 0x87921587, 0xe920c9e9, 0xce4987ce, 0x55ffaa55, 0x28785028, 0xdf7aa5df, 0x8c8f038c, 0xa1f859a1, 0x89800989, 0x0d171a0d, 0xbfda65bf, 0xe631d7e6, 0x42c68442, 0x68b8d068, 0x41c38241, 0x99b02999, 0x2d775a2d, 0x0f111e0f, 0xb0cb7bb0, 0x54fca854, 0xbbd66dbb, 0x163a2c16];
            Aes.T4 = [0x6363a5c6, 0x7c7c84f8, 0x777799ee, 0x7b7b8df6, 0xf2f20dff, 0x6b6bbdd6, 0x6f6fb1de, 0xc5c55491, 0x30305060, 0x01010302, 0x6767a9ce, 0x2b2b7d56, 0xfefe19e7, 0xd7d762b5, 0xababe64d, 0x76769aec, 0xcaca458f, 0x82829d1f, 0xc9c94089, 0x7d7d87fa, 0xfafa15ef, 0x5959ebb2, 0x4747c98e, 0xf0f00bfb, 0xadadec41, 0xd4d467b3, 0xa2a2fd5f, 0xafafea45, 0x9c9cbf23, 0xa4a4f753, 0x727296e4, 0xc0c05b9b, 0xb7b7c275, 0xfdfd1ce1, 0x9393ae3d, 0x26266a4c, 0x36365a6c, 0x3f3f417e, 0xf7f702f5, 0xcccc4f83, 0x34345c68, 0xa5a5f451, 0xe5e534d1, 0xf1f108f9, 0x717193e2, 0xd8d873ab, 0x31315362, 0x15153f2a, 0x04040c08, 0xc7c75295, 0x23236546, 0xc3c35e9d, 0x18182830, 0x9696a137, 0x05050f0a, 0x9a9ab52f, 0x0707090e, 0x12123624, 0x80809b1b, 0xe2e23ddf, 0xebeb26cd, 0x2727694e, 0xb2b2cd7f, 0x75759fea, 0x09091b12, 0x83839e1d, 0x2c2c7458, 0x1a1a2e34, 0x1b1b2d36, 0x6e6eb2dc, 0x5a5aeeb4, 0xa0a0fb5b, 0x5252f6a4, 0x3b3b4d76, 0xd6d661b7, 0xb3b3ce7d, 0x29297b52, 0xe3e33edd, 0x2f2f715e, 0x84849713, 0x5353f5a6, 0xd1d168b9, 0x00000000, 0xeded2cc1, 0x20206040, 0xfcfc1fe3, 0xb1b1c879, 0x5b5bedb6, 0x6a6abed4, 0xcbcb468d, 0xbebed967, 0x39394b72, 0x4a4ade94, 0x4c4cd498, 0x5858e8b0, 0xcfcf4a85, 0xd0d06bbb, 0xefef2ac5, 0xaaaae54f, 0xfbfb16ed, 0x4343c586, 0x4d4dd79a, 0x33335566, 0x85859411, 0x4545cf8a, 0xf9f910e9, 0x02020604, 0x7f7f81fe, 0x5050f0a0, 0x3c3c4478, 0x9f9fba25, 0xa8a8e34b, 0x5151f3a2, 0xa3a3fe5d, 0x4040c080, 0x8f8f8a05, 0x9292ad3f, 0x9d9dbc21, 0x38384870, 0xf5f504f1, 0xbcbcdf63, 0xb6b6c177, 0xdada75af, 0x21216342, 0x10103020, 0xffff1ae5, 0xf3f30efd, 0xd2d26dbf, 0xcdcd4c81, 0x0c0c1418, 0x13133526, 0xecec2fc3, 0x5f5fe1be, 0x9797a235, 0x4444cc88, 0x1717392e, 0xc4c45793, 0xa7a7f255, 0x7e7e82fc, 0x3d3d477a, 0x6464acc8, 0x5d5de7ba, 0x19192b32, 0x737395e6, 0x6060a0c0, 0x81819819, 0x4f4fd19e, 0xdcdc7fa3, 0x22226644, 0x2a2a7e54, 0x9090ab3b, 0x8888830b, 0x4646ca8c, 0xeeee29c7, 0xb8b8d36b, 0x14143c28, 0xdede79a7, 0x5e5ee2bc, 0x0b0b1d16, 0xdbdb76ad, 0xe0e03bdb, 0x32325664, 0x3a3a4e74, 0x0a0a1e14, 0x4949db92, 0x06060a0c, 0x24246c48, 0x5c5ce4b8, 0xc2c25d9f, 0xd3d36ebd, 0xacacef43, 0x6262a6c4, 0x9191a839, 0x9595a431, 0xe4e437d3, 0x79798bf2, 0xe7e732d5, 0xc8c8438b, 0x3737596e, 0x6d6db7da, 0x8d8d8c01, 0xd5d564b1, 0x4e4ed29c, 0xa9a9e049, 0x6c6cb4d8, 0x5656faac, 0xf4f407f3, 0xeaea25cf, 0x6565afca, 0x7a7a8ef4, 0xaeaee947, 0x08081810, 0xbabad56f, 0x787888f0, 0x25256f4a, 0x2e2e725c, 0x1c1c2438, 0xa6a6f157, 0xb4b4c773, 0xc6c65197, 0xe8e823cb, 0xdddd7ca1, 0x74749ce8, 0x1f1f213e, 0x4b4bdd96, 0xbdbddc61, 0x8b8b860d, 0x8a8a850f, 0x707090e0, 0x3e3e427c, 0xb5b5c471, 0x6666aacc, 0x4848d890, 0x03030506, 0xf6f601f7, 0x0e0e121c, 0x6161a3c2, 0x35355f6a, 0x5757f9ae, 0xb9b9d069, 0x86869117, 0xc1c15899, 0x1d1d273a, 0x9e9eb927, 0xe1e138d9, 0xf8f813eb, 0x9898b32b, 0x11113322, 0x6969bbd2, 0xd9d970a9, 0x8e8e8907, 0x9494a733, 0x9b9bb62d, 0x1e1e223c, 0x87879215, 0xe9e920c9, 0xcece4987, 0x5555ffaa, 0x28287850, 0xdfdf7aa5, 0x8c8c8f03, 0xa1a1f859, 0x89898009, 0x0d0d171a, 0xbfbfda65, 0xe6e631d7, 0x4242c684, 0x6868b8d0, 0x4141c382, 0x9999b029, 0x2d2d775a, 0x0f0f111e, 0xb0b0cb7b, 0x5454fca8, 0xbbbbd66d, 0x16163a2c];
            Aes.T5 = [0x51f4a750, 0x7e416553, 0x1a17a4c3, 0x3a275e96, 0x3bab6bcb, 0x1f9d45f1, 0xacfa58ab, 0x4be30393, 0x2030fa55, 0xad766df6, 0x88cc7691, 0xf5024c25, 0x4fe5d7fc, 0xc52acbd7, 0x26354480, 0xb562a38f, 0xdeb15a49, 0x25ba1b67, 0x45ea0e98, 0x5dfec0e1, 0xc32f7502, 0x814cf012, 0x8d4697a3, 0x6bd3f9c6, 0x038f5fe7, 0x15929c95, 0xbf6d7aeb, 0x955259da, 0xd4be832d, 0x587421d3, 0x49e06929, 0x8ec9c844, 0x75c2896a, 0xf48e7978, 0x99583e6b, 0x27b971dd, 0xbee14fb6, 0xf088ad17, 0xc920ac66, 0x7dce3ab4, 0x63df4a18, 0xe51a3182, 0x97513360, 0x62537f45, 0xb16477e0, 0xbb6bae84, 0xfe81a01c, 0xf9082b94, 0x70486858, 0x8f45fd19, 0x94de6c87, 0x527bf8b7, 0xab73d323, 0x724b02e2, 0xe31f8f57, 0x6655ab2a, 0xb2eb2807, 0x2fb5c203, 0x86c57b9a, 0xd33708a5, 0x302887f2, 0x23bfa5b2, 0x02036aba, 0xed16825c, 0x8acf1c2b, 0xa779b492, 0xf307f2f0, 0x4e69e2a1, 0x65daf4cd, 0x0605bed5, 0xd134621f, 0xc4a6fe8a, 0x342e539d, 0xa2f355a0, 0x058ae132, 0xa4f6eb75, 0x0b83ec39, 0x4060efaa, 0x5e719f06, 0xbd6e1051, 0x3e218af9, 0x96dd063d, 0xdd3e05ae, 0x4de6bd46, 0x91548db5, 0x71c45d05, 0x0406d46f, 0x605015ff, 0x1998fb24, 0xd6bde997, 0x894043cc, 0x67d99e77, 0xb0e842bd, 0x07898b88, 0xe7195b38, 0x79c8eedb, 0xa17c0a47, 0x7c420fe9, 0xf8841ec9, 0x00000000, 0x09808683, 0x322bed48, 0x1e1170ac, 0x6c5a724e, 0xfd0efffb, 0x0f853856, 0x3daed51e, 0x362d3927, 0x0a0fd964, 0x685ca621, 0x9b5b54d1, 0x24362e3a, 0x0c0a67b1, 0x9357e70f, 0xb4ee96d2, 0x1b9b919e, 0x80c0c54f, 0x61dc20a2, 0x5a774b69, 0x1c121a16, 0xe293ba0a, 0xc0a02ae5, 0x3c22e043, 0x121b171d, 0x0e090d0b, 0xf28bc7ad, 0x2db6a8b9, 0x141ea9c8, 0x57f11985, 0xaf75074c, 0xee99ddbb, 0xa37f60fd, 0xf701269f, 0x5c72f5bc, 0x44663bc5, 0x5bfb7e34, 0x8b432976, 0xcb23c6dc, 0xb6edfc68, 0xb8e4f163, 0xd731dcca, 0x42638510, 0x13972240, 0x84c61120, 0x854a247d, 0xd2bb3df8, 0xaef93211, 0xc729a16d, 0x1d9e2f4b, 0xdcb230f3, 0x0d8652ec, 0x77c1e3d0, 0x2bb3166c, 0xa970b999, 0x119448fa, 0x47e96422, 0xa8fc8cc4, 0xa0f03f1a, 0x567d2cd8, 0x223390ef, 0x87494ec7, 0xd938d1c1, 0x8ccaa2fe, 0x98d40b36, 0xa6f581cf, 0xa57ade28, 0xdab78e26, 0x3fadbfa4, 0x2c3a9de4, 0x5078920d, 0x6a5fcc9b, 0x547e4662, 0xf68d13c2, 0x90d8b8e8, 0x2e39f75e, 0x82c3aff5, 0x9f5d80be, 0x69d0937c, 0x6fd52da9, 0xcf2512b3, 0xc8ac993b, 0x10187da7, 0xe89c636e, 0xdb3bbb7b, 0xcd267809, 0x6e5918f4, 0xec9ab701, 0x834f9aa8, 0xe6956e65, 0xaaffe67e, 0x21bccf08, 0xef15e8e6, 0xbae79bd9, 0x4a6f36ce, 0xea9f09d4, 0x29b07cd6, 0x31a4b2af, 0x2a3f2331, 0xc6a59430, 0x35a266c0, 0x744ebc37, 0xfc82caa6, 0xe090d0b0, 0x33a7d815, 0xf104984a, 0x41ecdaf7, 0x7fcd500e, 0x1791f62f, 0x764dd68d, 0x43efb04d, 0xccaa4d54, 0xe49604df, 0x9ed1b5e3, 0x4c6a881b, 0xc12c1fb8, 0x4665517f, 0x9d5eea04, 0x018c355d, 0xfa877473, 0xfb0b412e, 0xb3671d5a, 0x92dbd252, 0xe9105633, 0x6dd64713, 0x9ad7618c, 0x37a10c7a, 0x59f8148e, 0xeb133c89, 0xcea927ee, 0xb761c935, 0xe11ce5ed, 0x7a47b13c, 0x9cd2df59, 0x55f2733f, 0x1814ce79, 0x73c737bf, 0x53f7cdea, 0x5ffdaa5b, 0xdf3d6f14, 0x7844db86, 0xcaaff381, 0xb968c43e, 0x3824342c, 0xc2a3405f, 0x161dc372, 0xbce2250c, 0x283c498b, 0xff0d9541, 0x39a80171, 0x080cb3de, 0xd8b4e49c, 0x6456c190, 0x7bcb8461, 0xd532b670, 0x486c5c74, 0xd0b85742];
            Aes.T6 = [0x5051f4a7, 0x537e4165, 0xc31a17a4, 0x963a275e, 0xcb3bab6b, 0xf11f9d45, 0xabacfa58, 0x934be303, 0x552030fa, 0xf6ad766d, 0x9188cc76, 0x25f5024c, 0xfc4fe5d7, 0xd7c52acb, 0x80263544, 0x8fb562a3, 0x49deb15a, 0x6725ba1b, 0x9845ea0e, 0xe15dfec0, 0x02c32f75, 0x12814cf0, 0xa38d4697, 0xc66bd3f9, 0xe7038f5f, 0x9515929c, 0xebbf6d7a, 0xda955259, 0x2dd4be83, 0xd3587421, 0x2949e069, 0x448ec9c8, 0x6a75c289, 0x78f48e79, 0x6b99583e, 0xdd27b971, 0xb6bee14f, 0x17f088ad, 0x66c920ac, 0xb47dce3a, 0x1863df4a, 0x82e51a31, 0x60975133, 0x4562537f, 0xe0b16477, 0x84bb6bae, 0x1cfe81a0, 0x94f9082b, 0x58704868, 0x198f45fd, 0x8794de6c, 0xb7527bf8, 0x23ab73d3, 0xe2724b02, 0x57e31f8f, 0x2a6655ab, 0x07b2eb28, 0x032fb5c2, 0x9a86c57b, 0xa5d33708, 0xf2302887, 0xb223bfa5, 0xba02036a, 0x5ced1682, 0x2b8acf1c, 0x92a779b4, 0xf0f307f2, 0xa14e69e2, 0xcd65daf4, 0xd50605be, 0x1fd13462, 0x8ac4a6fe, 0x9d342e53, 0xa0a2f355, 0x32058ae1, 0x75a4f6eb, 0x390b83ec, 0xaa4060ef, 0x065e719f, 0x51bd6e10, 0xf93e218a, 0x3d96dd06, 0xaedd3e05, 0x464de6bd, 0xb591548d, 0x0571c45d, 0x6f0406d4, 0xff605015, 0x241998fb, 0x97d6bde9, 0xcc894043, 0x7767d99e, 0xbdb0e842, 0x8807898b, 0x38e7195b, 0xdb79c8ee, 0x47a17c0a, 0xe97c420f, 0xc9f8841e, 0x00000000, 0x83098086, 0x48322bed, 0xac1e1170, 0x4e6c5a72, 0xfbfd0eff, 0x560f8538, 0x1e3daed5, 0x27362d39, 0x640a0fd9, 0x21685ca6, 0xd19b5b54, 0x3a24362e, 0xb10c0a67, 0x0f9357e7, 0xd2b4ee96, 0x9e1b9b91, 0x4f80c0c5, 0xa261dc20, 0x695a774b, 0x161c121a, 0x0ae293ba, 0xe5c0a02a, 0x433c22e0, 0x1d121b17, 0x0b0e090d, 0xadf28bc7, 0xb92db6a8, 0xc8141ea9, 0x8557f119, 0x4caf7507, 0xbbee99dd, 0xfda37f60, 0x9ff70126, 0xbc5c72f5, 0xc544663b, 0x345bfb7e, 0x768b4329, 0xdccb23c6, 0x68b6edfc, 0x63b8e4f1, 0xcad731dc, 0x10426385, 0x40139722, 0x2084c611, 0x7d854a24, 0xf8d2bb3d, 0x11aef932, 0x6dc729a1, 0x4b1d9e2f, 0xf3dcb230, 0xec0d8652, 0xd077c1e3, 0x6c2bb316, 0x99a970b9, 0xfa119448, 0x2247e964, 0xc4a8fc8c, 0x1aa0f03f, 0xd8567d2c, 0xef223390, 0xc787494e, 0xc1d938d1, 0xfe8ccaa2, 0x3698d40b, 0xcfa6f581, 0x28a57ade, 0x26dab78e, 0xa43fadbf, 0xe42c3a9d, 0x0d507892, 0x9b6a5fcc, 0x62547e46, 0xc2f68d13, 0xe890d8b8, 0x5e2e39f7, 0xf582c3af, 0xbe9f5d80, 0x7c69d093, 0xa96fd52d, 0xb3cf2512, 0x3bc8ac99, 0xa710187d, 0x6ee89c63, 0x7bdb3bbb, 0x09cd2678, 0xf46e5918, 0x01ec9ab7, 0xa8834f9a, 0x65e6956e, 0x7eaaffe6, 0x0821bccf, 0xe6ef15e8, 0xd9bae79b, 0xce4a6f36, 0xd4ea9f09, 0xd629b07c, 0xaf31a4b2, 0x312a3f23, 0x30c6a594, 0xc035a266, 0x37744ebc, 0xa6fc82ca, 0xb0e090d0, 0x1533a7d8, 0x4af10498, 0xf741ecda, 0x0e7fcd50, 0x2f1791f6, 0x8d764dd6, 0x4d43efb0, 0x54ccaa4d, 0xdfe49604, 0xe39ed1b5, 0x1b4c6a88, 0xb8c12c1f, 0x7f466551, 0x049d5eea, 0x5d018c35, 0x73fa8774, 0x2efb0b41, 0x5ab3671d, 0x5292dbd2, 0x33e91056, 0x136dd647, 0x8c9ad761, 0x7a37a10c, 0x8e59f814, 0x89eb133c, 0xeecea927, 0x35b761c9, 0xede11ce5, 0x3c7a47b1, 0x599cd2df, 0x3f55f273, 0x791814ce, 0xbf73c737, 0xea53f7cd, 0x5b5ffdaa, 0x14df3d6f, 0x867844db, 0x81caaff3, 0x3eb968c4, 0x2c382434, 0x5fc2a340, 0x72161dc3, 0x0cbce225, 0x8b283c49, 0x41ff0d95, 0x7139a801, 0xde080cb3, 0x9cd8b4e4, 0x906456c1, 0x617bcb84, 0x70d532b6, 0x74486c5c, 0x42d0b857];
            Aes.T7 = [0xa75051f4, 0x65537e41, 0xa4c31a17, 0x5e963a27, 0x6bcb3bab, 0x45f11f9d, 0x58abacfa, 0x03934be3, 0xfa552030, 0x6df6ad76, 0x769188cc, 0x4c25f502, 0xd7fc4fe5, 0xcbd7c52a, 0x44802635, 0xa38fb562, 0x5a49deb1, 0x1b6725ba, 0x0e9845ea, 0xc0e15dfe, 0x7502c32f, 0xf012814c, 0x97a38d46, 0xf9c66bd3, 0x5fe7038f, 0x9c951592, 0x7aebbf6d, 0x59da9552, 0x832dd4be, 0x21d35874, 0x692949e0, 0xc8448ec9, 0x896a75c2, 0x7978f48e, 0x3e6b9958, 0x71dd27b9, 0x4fb6bee1, 0xad17f088, 0xac66c920, 0x3ab47dce, 0x4a1863df, 0x3182e51a, 0x33609751, 0x7f456253, 0x77e0b164, 0xae84bb6b, 0xa01cfe81, 0x2b94f908, 0x68587048, 0xfd198f45, 0x6c8794de, 0xf8b7527b, 0xd323ab73, 0x02e2724b, 0x8f57e31f, 0xab2a6655, 0x2807b2eb, 0xc2032fb5, 0x7b9a86c5, 0x08a5d337, 0x87f23028, 0xa5b223bf, 0x6aba0203, 0x825ced16, 0x1c2b8acf, 0xb492a779, 0xf2f0f307, 0xe2a14e69, 0xf4cd65da, 0xbed50605, 0x621fd134, 0xfe8ac4a6, 0x539d342e, 0x55a0a2f3, 0xe132058a, 0xeb75a4f6, 0xec390b83, 0xefaa4060, 0x9f065e71, 0x1051bd6e, 0x8af93e21, 0x063d96dd, 0x05aedd3e, 0xbd464de6, 0x8db59154, 0x5d0571c4, 0xd46f0406, 0x15ff6050, 0xfb241998, 0xe997d6bd, 0x43cc8940, 0x9e7767d9, 0x42bdb0e8, 0x8b880789, 0x5b38e719, 0xeedb79c8, 0x0a47a17c, 0x0fe97c42, 0x1ec9f884, 0x00000000, 0x86830980, 0xed48322b, 0x70ac1e11, 0x724e6c5a, 0xfffbfd0e, 0x38560f85, 0xd51e3dae, 0x3927362d, 0xd9640a0f, 0xa621685c, 0x54d19b5b, 0x2e3a2436, 0x67b10c0a, 0xe70f9357, 0x96d2b4ee, 0x919e1b9b, 0xc54f80c0, 0x20a261dc, 0x4b695a77, 0x1a161c12, 0xba0ae293, 0x2ae5c0a0, 0xe0433c22, 0x171d121b, 0x0d0b0e09, 0xc7adf28b, 0xa8b92db6, 0xa9c8141e, 0x198557f1, 0x074caf75, 0xddbbee99, 0x60fda37f, 0x269ff701, 0xf5bc5c72, 0x3bc54466, 0x7e345bfb, 0x29768b43, 0xc6dccb23, 0xfc68b6ed, 0xf163b8e4, 0xdccad731, 0x85104263, 0x22401397, 0x112084c6, 0x247d854a, 0x3df8d2bb, 0x3211aef9, 0xa16dc729, 0x2f4b1d9e, 0x30f3dcb2, 0x52ec0d86, 0xe3d077c1, 0x166c2bb3, 0xb999a970, 0x48fa1194, 0x642247e9, 0x8cc4a8fc, 0x3f1aa0f0, 0x2cd8567d, 0x90ef2233, 0x4ec78749, 0xd1c1d938, 0xa2fe8cca, 0x0b3698d4, 0x81cfa6f5, 0xde28a57a, 0x8e26dab7, 0xbfa43fad, 0x9de42c3a, 0x920d5078, 0xcc9b6a5f, 0x4662547e, 0x13c2f68d, 0xb8e890d8, 0xf75e2e39, 0xaff582c3, 0x80be9f5d, 0x937c69d0, 0x2da96fd5, 0x12b3cf25, 0x993bc8ac, 0x7da71018, 0x636ee89c, 0xbb7bdb3b, 0x7809cd26, 0x18f46e59, 0xb701ec9a, 0x9aa8834f, 0x6e65e695, 0xe67eaaff, 0xcf0821bc, 0xe8e6ef15, 0x9bd9bae7, 0x36ce4a6f, 0x09d4ea9f, 0x7cd629b0, 0xb2af31a4, 0x23312a3f, 0x9430c6a5, 0x66c035a2, 0xbc37744e, 0xcaa6fc82, 0xd0b0e090, 0xd81533a7, 0x984af104, 0xdaf741ec, 0x500e7fcd, 0xf62f1791, 0xd68d764d, 0xb04d43ef, 0x4d54ccaa, 0x04dfe496, 0xb5e39ed1, 0x881b4c6a, 0x1fb8c12c, 0x517f4665, 0xea049d5e, 0x355d018c, 0x7473fa87, 0x412efb0b, 0x1d5ab367, 0xd25292db, 0x5633e910, 0x47136dd6, 0x618c9ad7, 0x0c7a37a1, 0x148e59f8, 0x3c89eb13, 0x27eecea9, 0xc935b761, 0xe5ede11c, 0xb13c7a47, 0xdf599cd2, 0x733f55f2, 0xce791814, 0x37bf73c7, 0xcdea53f7, 0xaa5b5ffd, 0x6f14df3d, 0xdb867844, 0xf381caaf, 0xc43eb968, 0x342c3824, 0x405fc2a3, 0xc372161d, 0x250cbce2, 0x498b283c, 0x9541ff0d, 0x017139a8, 0xb3de080c, 0xe49cd8b4, 0xc1906456, 0x84617bcb, 0xb670d532, 0x5c74486c, 0x5742d0b8];
            Aes.T8 = [0xf4a75051, 0x4165537e, 0x17a4c31a, 0x275e963a, 0xab6bcb3b, 0x9d45f11f, 0xfa58abac, 0xe303934b, 0x30fa5520, 0x766df6ad, 0xcc769188, 0x024c25f5, 0xe5d7fc4f, 0x2acbd7c5, 0x35448026, 0x62a38fb5, 0xb15a49de, 0xba1b6725, 0xea0e9845, 0xfec0e15d, 0x2f7502c3, 0x4cf01281, 0x4697a38d, 0xd3f9c66b, 0x8f5fe703, 0x929c9515, 0x6d7aebbf, 0x5259da95, 0xbe832dd4, 0x7421d358, 0xe0692949, 0xc9c8448e, 0xc2896a75, 0x8e7978f4, 0x583e6b99, 0xb971dd27, 0xe14fb6be, 0x88ad17f0, 0x20ac66c9, 0xce3ab47d, 0xdf4a1863, 0x1a3182e5, 0x51336097, 0x537f4562, 0x6477e0b1, 0x6bae84bb, 0x81a01cfe, 0x082b94f9, 0x48685870, 0x45fd198f, 0xde6c8794, 0x7bf8b752, 0x73d323ab, 0x4b02e272, 0x1f8f57e3, 0x55ab2a66, 0xeb2807b2, 0xb5c2032f, 0xc57b9a86, 0x3708a5d3, 0x2887f230, 0xbfa5b223, 0x036aba02, 0x16825ced, 0xcf1c2b8a, 0x79b492a7, 0x07f2f0f3, 0x69e2a14e, 0xdaf4cd65, 0x05bed506, 0x34621fd1, 0xa6fe8ac4, 0x2e539d34, 0xf355a0a2, 0x8ae13205, 0xf6eb75a4, 0x83ec390b, 0x60efaa40, 0x719f065e, 0x6e1051bd, 0x218af93e, 0xdd063d96, 0x3e05aedd, 0xe6bd464d, 0x548db591, 0xc45d0571, 0x06d46f04, 0x5015ff60, 0x98fb2419, 0xbde997d6, 0x4043cc89, 0xd99e7767, 0xe842bdb0, 0x898b8807, 0x195b38e7, 0xc8eedb79, 0x7c0a47a1, 0x420fe97c, 0x841ec9f8, 0x00000000, 0x80868309, 0x2bed4832, 0x1170ac1e, 0x5a724e6c, 0x0efffbfd, 0x8538560f, 0xaed51e3d, 0x2d392736, 0x0fd9640a, 0x5ca62168, 0x5b54d19b, 0x362e3a24, 0x0a67b10c, 0x57e70f93, 0xee96d2b4, 0x9b919e1b, 0xc0c54f80, 0xdc20a261, 0x774b695a, 0x121a161c, 0x93ba0ae2, 0xa02ae5c0, 0x22e0433c, 0x1b171d12, 0x090d0b0e, 0x8bc7adf2, 0xb6a8b92d, 0x1ea9c814, 0xf1198557, 0x75074caf, 0x99ddbbee, 0x7f60fda3, 0x01269ff7, 0x72f5bc5c, 0x663bc544, 0xfb7e345b, 0x4329768b, 0x23c6dccb, 0xedfc68b6, 0xe4f163b8, 0x31dccad7, 0x63851042, 0x97224013, 0xc6112084, 0x4a247d85, 0xbb3df8d2, 0xf93211ae, 0x29a16dc7, 0x9e2f4b1d, 0xb230f3dc, 0x8652ec0d, 0xc1e3d077, 0xb3166c2b, 0x70b999a9, 0x9448fa11, 0xe9642247, 0xfc8cc4a8, 0xf03f1aa0, 0x7d2cd856, 0x3390ef22, 0x494ec787, 0x38d1c1d9, 0xcaa2fe8c, 0xd40b3698, 0xf581cfa6, 0x7ade28a5, 0xb78e26da, 0xadbfa43f, 0x3a9de42c, 0x78920d50, 0x5fcc9b6a, 0x7e466254, 0x8d13c2f6, 0xd8b8e890, 0x39f75e2e, 0xc3aff582, 0x5d80be9f, 0xd0937c69, 0xd52da96f, 0x2512b3cf, 0xac993bc8, 0x187da710, 0x9c636ee8, 0x3bbb7bdb, 0x267809cd, 0x5918f46e, 0x9ab701ec, 0x4f9aa883, 0x956e65e6, 0xffe67eaa, 0xbccf0821, 0x15e8e6ef, 0xe79bd9ba, 0x6f36ce4a, 0x9f09d4ea, 0xb07cd629, 0xa4b2af31, 0x3f23312a, 0xa59430c6, 0xa266c035, 0x4ebc3774, 0x82caa6fc, 0x90d0b0e0, 0xa7d81533, 0x04984af1, 0xecdaf741, 0xcd500e7f, 0x91f62f17, 0x4dd68d76, 0xefb04d43, 0xaa4d54cc, 0x9604dfe4, 0xd1b5e39e, 0x6a881b4c, 0x2c1fb8c1, 0x65517f46, 0x5eea049d, 0x8c355d01, 0x877473fa, 0x0b412efb, 0x671d5ab3, 0xdbd25292, 0x105633e9, 0xd647136d, 0xd7618c9a, 0xa10c7a37, 0xf8148e59, 0x133c89eb, 0xa927eece, 0x61c935b7, 0x1ce5ede1, 0x47b13c7a, 0xd2df599c, 0xf2733f55, 0x14ce7918, 0xc737bf73, 0xf7cdea53, 0xfdaa5b5f, 0x3d6f14df, 0x44db8678, 0xaff381ca, 0x68c43eb9, 0x24342c38, 0xa3405fc2, 0x1dc37216, 0xe2250cbc, 0x3c498b28, 0x0d9541ff, 0xa8017139, 0x0cb3de08, 0xb4e49cd8, 0x56c19064, 0xcb84617b, 0x32b670d5, 0x6c5c7448, 0xb85742d0];
            Aes.U1 = [0x00000000, 0x0e090d0b, 0x1c121a16, 0x121b171d, 0x3824342c, 0x362d3927, 0x24362e3a, 0x2a3f2331, 0x70486858, 0x7e416553, 0x6c5a724e, 0x62537f45, 0x486c5c74, 0x4665517f, 0x547e4662, 0x5a774b69, 0xe090d0b0, 0xee99ddbb, 0xfc82caa6, 0xf28bc7ad, 0xd8b4e49c, 0xd6bde997, 0xc4a6fe8a, 0xcaaff381, 0x90d8b8e8, 0x9ed1b5e3, 0x8ccaa2fe, 0x82c3aff5, 0xa8fc8cc4, 0xa6f581cf, 0xb4ee96d2, 0xbae79bd9, 0xdb3bbb7b, 0xd532b670, 0xc729a16d, 0xc920ac66, 0xe31f8f57, 0xed16825c, 0xff0d9541, 0xf104984a, 0xab73d323, 0xa57ade28, 0xb761c935, 0xb968c43e, 0x9357e70f, 0x9d5eea04, 0x8f45fd19, 0x814cf012, 0x3bab6bcb, 0x35a266c0, 0x27b971dd, 0x29b07cd6, 0x038f5fe7, 0x0d8652ec, 0x1f9d45f1, 0x119448fa, 0x4be30393, 0x45ea0e98, 0x57f11985, 0x59f8148e, 0x73c737bf, 0x7dce3ab4, 0x6fd52da9, 0x61dc20a2, 0xad766df6, 0xa37f60fd, 0xb16477e0, 0xbf6d7aeb, 0x955259da, 0x9b5b54d1, 0x894043cc, 0x87494ec7, 0xdd3e05ae, 0xd33708a5, 0xc12c1fb8, 0xcf2512b3, 0xe51a3182, 0xeb133c89, 0xf9082b94, 0xf701269f, 0x4de6bd46, 0x43efb04d, 0x51f4a750, 0x5ffdaa5b, 0x75c2896a, 0x7bcb8461, 0x69d0937c, 0x67d99e77, 0x3daed51e, 0x33a7d815, 0x21bccf08, 0x2fb5c203, 0x058ae132, 0x0b83ec39, 0x1998fb24, 0x1791f62f, 0x764dd68d, 0x7844db86, 0x6a5fcc9b, 0x6456c190, 0x4e69e2a1, 0x4060efaa, 0x527bf8b7, 0x5c72f5bc, 0x0605bed5, 0x080cb3de, 0x1a17a4c3, 0x141ea9c8, 0x3e218af9, 0x302887f2, 0x223390ef, 0x2c3a9de4, 0x96dd063d, 0x98d40b36, 0x8acf1c2b, 0x84c61120, 0xaef93211, 0xa0f03f1a, 0xb2eb2807, 0xbce2250c, 0xe6956e65, 0xe89c636e, 0xfa877473, 0xf48e7978, 0xdeb15a49, 0xd0b85742, 0xc2a3405f, 0xccaa4d54, 0x41ecdaf7, 0x4fe5d7fc, 0x5dfec0e1, 0x53f7cdea, 0x79c8eedb, 0x77c1e3d0, 0x65daf4cd, 0x6bd3f9c6, 0x31a4b2af, 0x3fadbfa4, 0x2db6a8b9, 0x23bfa5b2, 0x09808683, 0x07898b88, 0x15929c95, 0x1b9b919e, 0xa17c0a47, 0xaf75074c, 0xbd6e1051, 0xb3671d5a, 0x99583e6b, 0x97513360, 0x854a247d, 0x8b432976, 0xd134621f, 0xdf3d6f14, 0xcd267809, 0xc32f7502, 0xe9105633, 0xe7195b38, 0xf5024c25, 0xfb0b412e, 0x9ad7618c, 0x94de6c87, 0x86c57b9a, 0x88cc7691, 0xa2f355a0, 0xacfa58ab, 0xbee14fb6, 0xb0e842bd, 0xea9f09d4, 0xe49604df, 0xf68d13c2, 0xf8841ec9, 0xd2bb3df8, 0xdcb230f3, 0xcea927ee, 0xc0a02ae5, 0x7a47b13c, 0x744ebc37, 0x6655ab2a, 0x685ca621, 0x42638510, 0x4c6a881b, 0x5e719f06, 0x5078920d, 0x0a0fd964, 0x0406d46f, 0x161dc372, 0x1814ce79, 0x322bed48, 0x3c22e043, 0x2e39f75e, 0x2030fa55, 0xec9ab701, 0xe293ba0a, 0xf088ad17, 0xfe81a01c, 0xd4be832d, 0xdab78e26, 0xc8ac993b, 0xc6a59430, 0x9cd2df59, 0x92dbd252, 0x80c0c54f, 0x8ec9c844, 0xa4f6eb75, 0xaaffe67e, 0xb8e4f163, 0xb6edfc68, 0x0c0a67b1, 0x02036aba, 0x10187da7, 0x1e1170ac, 0x342e539d, 0x3a275e96, 0x283c498b, 0x26354480, 0x7c420fe9, 0x724b02e2, 0x605015ff, 0x6e5918f4, 0x44663bc5, 0x4a6f36ce, 0x587421d3, 0x567d2cd8, 0x37a10c7a, 0x39a80171, 0x2bb3166c, 0x25ba1b67, 0x0f853856, 0x018c355d, 0x13972240, 0x1d9e2f4b, 0x47e96422, 0x49e06929, 0x5bfb7e34, 0x55f2733f, 0x7fcd500e, 0x71c45d05, 0x63df4a18, 0x6dd64713, 0xd731dcca, 0xd938d1c1, 0xcb23c6dc, 0xc52acbd7, 0xef15e8e6, 0xe11ce5ed, 0xf307f2f0, 0xfd0efffb, 0xa779b492, 0xa970b999, 0xbb6bae84, 0xb562a38f, 0x9f5d80be, 0x91548db5, 0x834f9aa8, 0x8d4697a3];
            Aes.U2 = [0x00000000, 0x0b0e090d, 0x161c121a, 0x1d121b17, 0x2c382434, 0x27362d39, 0x3a24362e, 0x312a3f23, 0x58704868, 0x537e4165, 0x4e6c5a72, 0x4562537f, 0x74486c5c, 0x7f466551, 0x62547e46, 0x695a774b, 0xb0e090d0, 0xbbee99dd, 0xa6fc82ca, 0xadf28bc7, 0x9cd8b4e4, 0x97d6bde9, 0x8ac4a6fe, 0x81caaff3, 0xe890d8b8, 0xe39ed1b5, 0xfe8ccaa2, 0xf582c3af, 0xc4a8fc8c, 0xcfa6f581, 0xd2b4ee96, 0xd9bae79b, 0x7bdb3bbb, 0x70d532b6, 0x6dc729a1, 0x66c920ac, 0x57e31f8f, 0x5ced1682, 0x41ff0d95, 0x4af10498, 0x23ab73d3, 0x28a57ade, 0x35b761c9, 0x3eb968c4, 0x0f9357e7, 0x049d5eea, 0x198f45fd, 0x12814cf0, 0xcb3bab6b, 0xc035a266, 0xdd27b971, 0xd629b07c, 0xe7038f5f, 0xec0d8652, 0xf11f9d45, 0xfa119448, 0x934be303, 0x9845ea0e, 0x8557f119, 0x8e59f814, 0xbf73c737, 0xb47dce3a, 0xa96fd52d, 0xa261dc20, 0xf6ad766d, 0xfda37f60, 0xe0b16477, 0xebbf6d7a, 0xda955259, 0xd19b5b54, 0xcc894043, 0xc787494e, 0xaedd3e05, 0xa5d33708, 0xb8c12c1f, 0xb3cf2512, 0x82e51a31, 0x89eb133c, 0x94f9082b, 0x9ff70126, 0x464de6bd, 0x4d43efb0, 0x5051f4a7, 0x5b5ffdaa, 0x6a75c289, 0x617bcb84, 0x7c69d093, 0x7767d99e, 0x1e3daed5, 0x1533a7d8, 0x0821bccf, 0x032fb5c2, 0x32058ae1, 0x390b83ec, 0x241998fb, 0x2f1791f6, 0x8d764dd6, 0x867844db, 0x9b6a5fcc, 0x906456c1, 0xa14e69e2, 0xaa4060ef, 0xb7527bf8, 0xbc5c72f5, 0xd50605be, 0xde080cb3, 0xc31a17a4, 0xc8141ea9, 0xf93e218a, 0xf2302887, 0xef223390, 0xe42c3a9d, 0x3d96dd06, 0x3698d40b, 0x2b8acf1c, 0x2084c611, 0x11aef932, 0x1aa0f03f, 0x07b2eb28, 0x0cbce225, 0x65e6956e, 0x6ee89c63, 0x73fa8774, 0x78f48e79, 0x49deb15a, 0x42d0b857, 0x5fc2a340, 0x54ccaa4d, 0xf741ecda, 0xfc4fe5d7, 0xe15dfec0, 0xea53f7cd, 0xdb79c8ee, 0xd077c1e3, 0xcd65daf4, 0xc66bd3f9, 0xaf31a4b2, 0xa43fadbf, 0xb92db6a8, 0xb223bfa5, 0x83098086, 0x8807898b, 0x9515929c, 0x9e1b9b91, 0x47a17c0a, 0x4caf7507, 0x51bd6e10, 0x5ab3671d, 0x6b99583e, 0x60975133, 0x7d854a24, 0x768b4329, 0x1fd13462, 0x14df3d6f, 0x09cd2678, 0x02c32f75, 0x33e91056, 0x38e7195b, 0x25f5024c, 0x2efb0b41, 0x8c9ad761, 0x8794de6c, 0x9a86c57b, 0x9188cc76, 0xa0a2f355, 0xabacfa58, 0xb6bee14f, 0xbdb0e842, 0xd4ea9f09, 0xdfe49604, 0xc2f68d13, 0xc9f8841e, 0xf8d2bb3d, 0xf3dcb230, 0xeecea927, 0xe5c0a02a, 0x3c7a47b1, 0x37744ebc, 0x2a6655ab, 0x21685ca6, 0x10426385, 0x1b4c6a88, 0x065e719f, 0x0d507892, 0x640a0fd9, 0x6f0406d4, 0x72161dc3, 0x791814ce, 0x48322bed, 0x433c22e0, 0x5e2e39f7, 0x552030fa, 0x01ec9ab7, 0x0ae293ba, 0x17f088ad, 0x1cfe81a0, 0x2dd4be83, 0x26dab78e, 0x3bc8ac99, 0x30c6a594, 0x599cd2df, 0x5292dbd2, 0x4f80c0c5, 0x448ec9c8, 0x75a4f6eb, 0x7eaaffe6, 0x63b8e4f1, 0x68b6edfc, 0xb10c0a67, 0xba02036a, 0xa710187d, 0xac1e1170, 0x9d342e53, 0x963a275e, 0x8b283c49, 0x80263544, 0xe97c420f, 0xe2724b02, 0xff605015, 0xf46e5918, 0xc544663b, 0xce4a6f36, 0xd3587421, 0xd8567d2c, 0x7a37a10c, 0x7139a801, 0x6c2bb316, 0x6725ba1b, 0x560f8538, 0x5d018c35, 0x40139722, 0x4b1d9e2f, 0x2247e964, 0x2949e069, 0x345bfb7e, 0x3f55f273, 0x0e7fcd50, 0x0571c45d, 0x1863df4a, 0x136dd647, 0xcad731dc, 0xc1d938d1, 0xdccb23c6, 0xd7c52acb, 0xe6ef15e8, 0xede11ce5, 0xf0f307f2, 0xfbfd0eff, 0x92a779b4, 0x99a970b9, 0x84bb6bae, 0x8fb562a3, 0xbe9f5d80, 0xb591548d, 0xa8834f9a, 0xa38d4697];
            Aes.U3 = [0x00000000, 0x0d0b0e09, 0x1a161c12, 0x171d121b, 0x342c3824, 0x3927362d, 0x2e3a2436, 0x23312a3f, 0x68587048, 0x65537e41, 0x724e6c5a, 0x7f456253, 0x5c74486c, 0x517f4665, 0x4662547e, 0x4b695a77, 0xd0b0e090, 0xddbbee99, 0xcaa6fc82, 0xc7adf28b, 0xe49cd8b4, 0xe997d6bd, 0xfe8ac4a6, 0xf381caaf, 0xb8e890d8, 0xb5e39ed1, 0xa2fe8cca, 0xaff582c3, 0x8cc4a8fc, 0x81cfa6f5, 0x96d2b4ee, 0x9bd9bae7, 0xbb7bdb3b, 0xb670d532, 0xa16dc729, 0xac66c920, 0x8f57e31f, 0x825ced16, 0x9541ff0d, 0x984af104, 0xd323ab73, 0xde28a57a, 0xc935b761, 0xc43eb968, 0xe70f9357, 0xea049d5e, 0xfd198f45, 0xf012814c, 0x6bcb3bab, 0x66c035a2, 0x71dd27b9, 0x7cd629b0, 0x5fe7038f, 0x52ec0d86, 0x45f11f9d, 0x48fa1194, 0x03934be3, 0x0e9845ea, 0x198557f1, 0x148e59f8, 0x37bf73c7, 0x3ab47dce, 0x2da96fd5, 0x20a261dc, 0x6df6ad76, 0x60fda37f, 0x77e0b164, 0x7aebbf6d, 0x59da9552, 0x54d19b5b, 0x43cc8940, 0x4ec78749, 0x05aedd3e, 0x08a5d337, 0x1fb8c12c, 0x12b3cf25, 0x3182e51a, 0x3c89eb13, 0x2b94f908, 0x269ff701, 0xbd464de6, 0xb04d43ef, 0xa75051f4, 0xaa5b5ffd, 0x896a75c2, 0x84617bcb, 0x937c69d0, 0x9e7767d9, 0xd51e3dae, 0xd81533a7, 0xcf0821bc, 0xc2032fb5, 0xe132058a, 0xec390b83, 0xfb241998, 0xf62f1791, 0xd68d764d, 0xdb867844, 0xcc9b6a5f, 0xc1906456, 0xe2a14e69, 0xefaa4060, 0xf8b7527b, 0xf5bc5c72, 0xbed50605, 0xb3de080c, 0xa4c31a17, 0xa9c8141e, 0x8af93e21, 0x87f23028, 0x90ef2233, 0x9de42c3a, 0x063d96dd, 0x0b3698d4, 0x1c2b8acf, 0x112084c6, 0x3211aef9, 0x3f1aa0f0, 0x2807b2eb, 0x250cbce2, 0x6e65e695, 0x636ee89c, 0x7473fa87, 0x7978f48e, 0x5a49deb1, 0x5742d0b8, 0x405fc2a3, 0x4d54ccaa, 0xdaf741ec, 0xd7fc4fe5, 0xc0e15dfe, 0xcdea53f7, 0xeedb79c8, 0xe3d077c1, 0xf4cd65da, 0xf9c66bd3, 0xb2af31a4, 0xbfa43fad, 0xa8b92db6, 0xa5b223bf, 0x86830980, 0x8b880789, 0x9c951592, 0x919e1b9b, 0x0a47a17c, 0x074caf75, 0x1051bd6e, 0x1d5ab367, 0x3e6b9958, 0x33609751, 0x247d854a, 0x29768b43, 0x621fd134, 0x6f14df3d, 0x7809cd26, 0x7502c32f, 0x5633e910, 0x5b38e719, 0x4c25f502, 0x412efb0b, 0x618c9ad7, 0x6c8794de, 0x7b9a86c5, 0x769188cc, 0x55a0a2f3, 0x58abacfa, 0x4fb6bee1, 0x42bdb0e8, 0x09d4ea9f, 0x04dfe496, 0x13c2f68d, 0x1ec9f884, 0x3df8d2bb, 0x30f3dcb2, 0x27eecea9, 0x2ae5c0a0, 0xb13c7a47, 0xbc37744e, 0xab2a6655, 0xa621685c, 0x85104263, 0x881b4c6a, 0x9f065e71, 0x920d5078, 0xd9640a0f, 0xd46f0406, 0xc372161d, 0xce791814, 0xed48322b, 0xe0433c22, 0xf75e2e39, 0xfa552030, 0xb701ec9a, 0xba0ae293, 0xad17f088, 0xa01cfe81, 0x832dd4be, 0x8e26dab7, 0x993bc8ac, 0x9430c6a5, 0xdf599cd2, 0xd25292db, 0xc54f80c0, 0xc8448ec9, 0xeb75a4f6, 0xe67eaaff, 0xf163b8e4, 0xfc68b6ed, 0x67b10c0a, 0x6aba0203, 0x7da71018, 0x70ac1e11, 0x539d342e, 0x5e963a27, 0x498b283c, 0x44802635, 0x0fe97c42, 0x02e2724b, 0x15ff6050, 0x18f46e59, 0x3bc54466, 0x36ce4a6f, 0x21d35874, 0x2cd8567d, 0x0c7a37a1, 0x017139a8, 0x166c2bb3, 0x1b6725ba, 0x38560f85, 0x355d018c, 0x22401397, 0x2f4b1d9e, 0x642247e9, 0x692949e0, 0x7e345bfb, 0x733f55f2, 0x500e7fcd, 0x5d0571c4, 0x4a1863df, 0x47136dd6, 0xdccad731, 0xd1c1d938, 0xc6dccb23, 0xcbd7c52a, 0xe8e6ef15, 0xe5ede11c, 0xf2f0f307, 0xfffbfd0e, 0xb492a779, 0xb999a970, 0xae84bb6b, 0xa38fb562, 0x80be9f5d, 0x8db59154, 0x9aa8834f, 0x97a38d46];
            Aes.U4 = [0x00000000, 0x090d0b0e, 0x121a161c, 0x1b171d12, 0x24342c38, 0x2d392736, 0x362e3a24, 0x3f23312a, 0x48685870, 0x4165537e, 0x5a724e6c, 0x537f4562, 0x6c5c7448, 0x65517f46, 0x7e466254, 0x774b695a, 0x90d0b0e0, 0x99ddbbee, 0x82caa6fc, 0x8bc7adf2, 0xb4e49cd8, 0xbde997d6, 0xa6fe8ac4, 0xaff381ca, 0xd8b8e890, 0xd1b5e39e, 0xcaa2fe8c, 0xc3aff582, 0xfc8cc4a8, 0xf581cfa6, 0xee96d2b4, 0xe79bd9ba, 0x3bbb7bdb, 0x32b670d5, 0x29a16dc7, 0x20ac66c9, 0x1f8f57e3, 0x16825ced, 0x0d9541ff, 0x04984af1, 0x73d323ab, 0x7ade28a5, 0x61c935b7, 0x68c43eb9, 0x57e70f93, 0x5eea049d, 0x45fd198f, 0x4cf01281, 0xab6bcb3b, 0xa266c035, 0xb971dd27, 0xb07cd629, 0x8f5fe703, 0x8652ec0d, 0x9d45f11f, 0x9448fa11, 0xe303934b, 0xea0e9845, 0xf1198557, 0xf8148e59, 0xc737bf73, 0xce3ab47d, 0xd52da96f, 0xdc20a261, 0x766df6ad, 0x7f60fda3, 0x6477e0b1, 0x6d7aebbf, 0x5259da95, 0x5b54d19b, 0x4043cc89, 0x494ec787, 0x3e05aedd, 0x3708a5d3, 0x2c1fb8c1, 0x2512b3cf, 0x1a3182e5, 0x133c89eb, 0x082b94f9, 0x01269ff7, 0xe6bd464d, 0xefb04d43, 0xf4a75051, 0xfdaa5b5f, 0xc2896a75, 0xcb84617b, 0xd0937c69, 0xd99e7767, 0xaed51e3d, 0xa7d81533, 0xbccf0821, 0xb5c2032f, 0x8ae13205, 0x83ec390b, 0x98fb2419, 0x91f62f17, 0x4dd68d76, 0x44db8678, 0x5fcc9b6a, 0x56c19064, 0x69e2a14e, 0x60efaa40, 0x7bf8b752, 0x72f5bc5c, 0x05bed506, 0x0cb3de08, 0x17a4c31a, 0x1ea9c814, 0x218af93e, 0x2887f230, 0x3390ef22, 0x3a9de42c, 0xdd063d96, 0xd40b3698, 0xcf1c2b8a, 0xc6112084, 0xf93211ae, 0xf03f1aa0, 0xeb2807b2, 0xe2250cbc, 0x956e65e6, 0x9c636ee8, 0x877473fa, 0x8e7978f4, 0xb15a49de, 0xb85742d0, 0xa3405fc2, 0xaa4d54cc, 0xecdaf741, 0xe5d7fc4f, 0xfec0e15d, 0xf7cdea53, 0xc8eedb79, 0xc1e3d077, 0xdaf4cd65, 0xd3f9c66b, 0xa4b2af31, 0xadbfa43f, 0xb6a8b92d, 0xbfa5b223, 0x80868309, 0x898b8807, 0x929c9515, 0x9b919e1b, 0x7c0a47a1, 0x75074caf, 0x6e1051bd, 0x671d5ab3, 0x583e6b99, 0x51336097, 0x4a247d85, 0x4329768b, 0x34621fd1, 0x3d6f14df, 0x267809cd, 0x2f7502c3, 0x105633e9, 0x195b38e7, 0x024c25f5, 0x0b412efb, 0xd7618c9a, 0xde6c8794, 0xc57b9a86, 0xcc769188, 0xf355a0a2, 0xfa58abac, 0xe14fb6be, 0xe842bdb0, 0x9f09d4ea, 0x9604dfe4, 0x8d13c2f6, 0x841ec9f8, 0xbb3df8d2, 0xb230f3dc, 0xa927eece, 0xa02ae5c0, 0x47b13c7a, 0x4ebc3774, 0x55ab2a66, 0x5ca62168, 0x63851042, 0x6a881b4c, 0x719f065e, 0x78920d50, 0x0fd9640a, 0x06d46f04, 0x1dc37216, 0x14ce7918, 0x2bed4832, 0x22e0433c, 0x39f75e2e, 0x30fa5520, 0x9ab701ec, 0x93ba0ae2, 0x88ad17f0, 0x81a01cfe, 0xbe832dd4, 0xb78e26da, 0xac993bc8, 0xa59430c6, 0xd2df599c, 0xdbd25292, 0xc0c54f80, 0xc9c8448e, 0xf6eb75a4, 0xffe67eaa, 0xe4f163b8, 0xedfc68b6, 0x0a67b10c, 0x036aba02, 0x187da710, 0x1170ac1e, 0x2e539d34, 0x275e963a, 0x3c498b28, 0x35448026, 0x420fe97c, 0x4b02e272, 0x5015ff60, 0x5918f46e, 0x663bc544, 0x6f36ce4a, 0x7421d358, 0x7d2cd856, 0xa10c7a37, 0xa8017139, 0xb3166c2b, 0xba1b6725, 0x8538560f, 0x8c355d01, 0x97224013, 0x9e2f4b1d, 0xe9642247, 0xe0692949, 0xfb7e345b, 0xf2733f55, 0xcd500e7f, 0xc45d0571, 0xdf4a1863, 0xd647136d, 0x31dccad7, 0x38d1c1d9, 0x23c6dccb, 0x2acbd7c5, 0x15e8e6ef, 0x1ce5ede1, 0x07f2f0f3, 0x0efffbfd, 0x79b492a7, 0x70b999a9, 0x6bae84bb, 0x62a38fb5, 0x5d80be9f, 0x548db591, 0x4f9aa883, 0x4697a38d];
            return Aes;
        }());
        Cryptography.Aes = Aes;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var Base58 = (function () {
            function Base58() {
            }
            Base58.decode = function (input) {
                var bi = Neo.BigInteger.Zero;
                for (var i = input.length - 1; i >= 0; i--) {
                    var index = Base58.Alphabet.indexOf(input[i]);
                    if (index == -1)
                        throw new RangeError();
                    bi = Neo.BigInteger.add(bi, Neo.BigInteger.multiply(Neo.BigInteger.pow(Base58.Alphabet.length, input.length - 1 - i), index));
                }
                var bytes = bi.toUint8Array();
                var leadingZeros = 0;
                for (var i = 0; i < input.length && input[i] == Base58.Alphabet[0]; i++) {
                    leadingZeros++;
                }
                var tmp = new Uint8Array(bytes.length + leadingZeros);
                for (var i = 0; i < bytes.length; i++)
                    tmp[i + leadingZeros] = bytes[bytes.length - 1 - i];
                return tmp;
            };
            Base58.encode = function (input) {
                var value = Neo.BigInteger.fromUint8Array(input, 1, false);
                var s = "";
                while (!value.isZero()) {
                    var r = Neo.BigInteger.divRem(value, Base58.Alphabet.length);
                    s = Base58.Alphabet[r.remainder.toInt32()] + s;
                    value = r.result;
                }
                for (var i = 0; i < input.length; i++) {
                    if (input[i] == 0)
                        s = Base58.Alphabet[0] + s;
                    else
                        break;
                }
                return s;
            };
            Base58.Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
            return Base58;
        }());
        Cryptography.Base58 = Base58;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var CryptoKey = (function () {
            function CryptoKey(type, extractable, algorithm, usages) {
                this.type = type;
                this.extractable = extractable;
                this.algorithm = algorithm;
                this.usages = usages;
            }
            return CryptoKey;
        }());
        Cryptography.CryptoKey = CryptoKey;
        var AesCryptoKey = (function (_super) {
            __extends(AesCryptoKey, _super);
            function AesCryptoKey(_key_bytes) {
                var _this = _super.call(this, "secret", true, { name: "AES-CBC", length: _key_bytes.length * 8 }, ["encrypt", "decrypt"]) || this;
                _this._key_bytes = _key_bytes;
                return _this;
            }
            AesCryptoKey.create = function (length) {
                if (length != 128 && length != 192 && length != 256)
                    throw new RangeError();
                var key = new AesCryptoKey(new Uint8Array(length / 8));
                window.crypto.getRandomValues(key._key_bytes);
                return key;
            };
            AesCryptoKey.prototype.export = function () {
                return this._key_bytes;
            };
            AesCryptoKey.import = function (keyData) {
                if (keyData.byteLength != 16 && keyData.byteLength != 24 && keyData.byteLength != 32)
                    throw new RangeError();
                return new AesCryptoKey(Uint8Array.fromArrayBuffer(keyData));
            };
            return AesCryptoKey;
        }(Neo.Cryptography.CryptoKey));
        Cryptography.AesCryptoKey = AesCryptoKey;
        var ECDsaCryptoKey = (function (_super) {
            __extends(ECDsaCryptoKey, _super);
            function ECDsaCryptoKey(publicKey, privateKey) {
                var _this = _super.call(this, privateKey == null ? "public" : "private", true, { name: "ECDSA", namedCurve: "P-256" }, [privateKey == null ? "verify" : "sign"]) || this;
                _this.publicKey = publicKey;
                _this.privateKey = privateKey;
                return _this;
            }
            return ECDsaCryptoKey;
        }(CryptoKey));
        Cryptography.ECDsaCryptoKey = ECDsaCryptoKey;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var _secp256k1;
        var _secp256r1;
        var ECCurve = (function () {
            function ECCurve(Q, A, B, N, G) {
                this.Q = Q;
                this.A = new Cryptography.ECFieldElement(A, this);
                this.B = new Cryptography.ECFieldElement(B, this);
                this.N = N;
                this.Infinity = new Cryptography.ECPoint(null, null, this);
                this.G = Cryptography.ECPoint.decodePoint(G, this);
            }
            Object.defineProperty(ECCurve, "secp256k1", {
                get: function () {
                    return _secp256k1 || (_secp256k1 = new ECCurve(Neo.BigInteger.fromString("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F", 16), Neo.BigInteger.Zero, new Neo.BigInteger(7), Neo.BigInteger.fromString("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16), ("04" + "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798" + "483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8").hexToBytes()));
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(ECCurve, "secp256r1", {
                get: function () {
                    return _secp256r1 || (_secp256r1 = new ECCurve(Neo.BigInteger.fromString("FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF", 16), Neo.BigInteger.fromString("FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC", 16), Neo.BigInteger.fromString("5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B", 16), Neo.BigInteger.fromString("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16), ("04" + "6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296" + "4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5").hexToBytes()));
                },
                enumerable: true,
                configurable: true
            });
            return ECCurve;
        }());
        Cryptography.ECCurve = ECCurve;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var ECDsa = (function () {
            function ECDsa(key) {
                this.key = key;
            }
            ECDsa.calculateE = function (n, message) {
                return Neo.BigInteger.fromUint8Array(new Uint8Array(Cryptography.Sha256.computeHash(message)), 1, false);
            };
            ECDsa.generateKey = function (curve) {
                var prikey = new Uint8Array(32);
                window.crypto.getRandomValues(prikey);
                var pubkey = Cryptography.ECPoint.multiply(curve.G, prikey);
                return {
                    privateKey: new Cryptography.ECDsaCryptoKey(pubkey, prikey),
                    publicKey: new Cryptography.ECDsaCryptoKey(pubkey)
                };
            };
            ECDsa.prototype.sign = function (message) {
                if (this.key.privateKey == null)
                    throw new Error();
                var e = ECDsa.calculateE(this.key.publicKey.curve.N, message);
                var d = Neo.BigInteger.fromUint8Array(this.key.privateKey, 1, false);
                var r, s;
                do {
                    var k = void 0;
                    do {
                        do {
                            k = Neo.BigInteger.random(this.key.publicKey.curve.N.bitLength(), window.crypto);
                        } while (k.sign() == 0 || k.compareTo(this.key.publicKey.curve.N) >= 0);
                        var p = Cryptography.ECPoint.multiply(this.key.publicKey.curve.G, k);
                        var x = p.x.value;
                        r = x.mod(this.key.publicKey.curve.N);
                    } while (r.sign() == 0);
                    s = k.modInverse(this.key.publicKey.curve.N).multiply(e.add(d.multiply(r))).mod(this.key.publicKey.curve.N);
                    if (s.compareTo(this.key.publicKey.curve.N.divide(2)) > 0) {
                        s = this.key.publicKey.curve.N.subtract(s);
                    }
                } while (s.sign() == 0);
                var arr = new Uint8Array(64);
                Array.copy(r.toUint8Array(false, 32), 0, arr, 0, 32);
                Array.copy(s.toUint8Array(false, 32), 0, arr, 32, 32);
                return arr.buffer;
            };
            ECDsa.sumOfTwoMultiplies = function (P, k, Q, l) {
                var m = Math.max(k.bitLength(), l.bitLength());
                var Z = Cryptography.ECPoint.add(P, Q);
                var R = P.curve.Infinity;
                for (var i = m - 1; i >= 0; --i) {
                    R = R.twice();
                    if (k.testBit(i)) {
                        if (l.testBit(i))
                            R = Cryptography.ECPoint.add(R, Z);
                        else
                            R = Cryptography.ECPoint.add(R, P);
                    }
                    else {
                        if (l.testBit(i))
                            R = Cryptography.ECPoint.add(R, Q);
                    }
                }
                return R;
            };
            ECDsa.prototype.verify = function (message, signature) {
                var arr = Uint8Array.fromArrayBuffer(signature);
                var r = Neo.BigInteger.fromUint8Array(arr.subarray(0, 32), 1, false);
                var s = Neo.BigInteger.fromUint8Array(arr.subarray(32, 64), 1, false);
                if (r.compareTo(this.key.publicKey.curve.N) >= 0 || s.compareTo(this.key.publicKey.curve.N) >= 0)
                    return false;
                var e = ECDsa.calculateE(this.key.publicKey.curve.N, message);
                var c = s.modInverse(this.key.publicKey.curve.N);
                var u1 = e.multiply(c).mod(this.key.publicKey.curve.N);
                var u2 = r.multiply(c).mod(this.key.publicKey.curve.N);
                var point = ECDsa.sumOfTwoMultiplies(this.key.publicKey.curve.G, u1, this.key.publicKey, u2);
                var v = point.x.value.mod(this.key.publicKey.curve.N);
                return v.equals(r);
            };
            return ECDsa;
        }());
        Cryptography.ECDsa = ECDsa;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var ECFieldElement = (function () {
            function ECFieldElement(value, curve) {
                this.value = value;
                this.curve = curve;
                if (Neo.BigInteger.compare(value, curve.Q) >= 0)
                    throw new RangeError("x value too large in field element");
            }
            ECFieldElement.prototype.add = function (other) {
                return new ECFieldElement(this.value.add(other.value).mod(this.curve.Q), this.curve);
            };
            ECFieldElement.prototype.compareTo = function (other) {
                if (this === other)
                    return 0;
                return this.value.compareTo(other.value);
            };
            ECFieldElement.prototype.divide = function (other) {
                return new ECFieldElement(this.value.multiply(other.value.modInverse(this.curve.Q)).mod(this.curve.Q), this.curve);
            };
            ECFieldElement.prototype.equals = function (other) {
                return this.value.equals(other.value);
            };
            ECFieldElement.fastLucasSequence = function (p, P, Q, k) {
                var n = k.bitLength();
                var s = k.getLowestSetBit();
                console.assert(k.testBit(s));
                var Uh = Neo.BigInteger.One;
                var Vl = new Neo.BigInteger(2);
                var Vh = P;
                var Ql = Neo.BigInteger.One;
                var Qh = Neo.BigInteger.One;
                for (var j = n - 1; j >= s + 1; --j) {
                    Ql = Neo.BigInteger.mod(Neo.BigInteger.multiply(Ql, Qh), p);
                    if (k.testBit(j)) {
                        Qh = Ql.multiply(Q).mod(p);
                        Uh = Uh.multiply(Vh).mod(p);
                        Vl = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
                        Vh = Vh.multiply(Vh).subtract(Qh.leftShift(1)).mod(p);
                    }
                    else {
                        Qh = Ql;
                        Uh = Uh.multiply(Vl).subtract(Ql).mod(p);
                        Vh = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
                        Vl = Vl.multiply(Vl).subtract(Ql.leftShift(1)).mod(p);
                    }
                }
                Ql = Ql.multiply(Qh).mod(p);
                Qh = Ql.multiply(Q).mod(p);
                Uh = Uh.multiply(Vl).subtract(Ql).mod(p);
                Vl = Vh.multiply(Vl).subtract(P.multiply(Ql)).mod(p);
                Ql = Ql.multiply(Qh).mod(p);
                for (var j = 1; j <= s; ++j) {
                    Uh = Uh.multiply(Vl).multiply(p);
                    Vl = Vl.multiply(Vl).subtract(Ql.leftShift(1)).mod(p);
                    Ql = Ql.multiply(Ql).mod(p);
                }
                return [Uh, Vl];
            };
            ECFieldElement.prototype.multiply = function (other) {
                return new ECFieldElement(this.value.multiply(other.value).mod(this.curve.Q), this.curve);
            };
            ECFieldElement.prototype.negate = function () {
                return new ECFieldElement(this.value.negate().mod(this.curve.Q), this.curve);
            };
            ECFieldElement.prototype.sqrt = function () {
                if (this.curve.Q.testBit(1)) {
                    var z = new ECFieldElement(Neo.BigInteger.modPow(this.value, this.curve.Q.rightShift(2).add(1), this.curve.Q), this.curve);
                    return z.square().equals(this) ? z : null;
                }
                var qMinusOne = this.curve.Q.subtract(1);
                var legendreExponent = qMinusOne.rightShift(1);
                if (Neo.BigInteger.modPow(this.value, legendreExponent, this.curve.Q).equals(1))
                    return null;
                var u = qMinusOne.rightShift(2);
                var k = u.leftShift(1).add(1);
                var Q = this.value;
                var fourQ = Q.leftShift(2).mod(this.curve.Q);
                var U, V;
                do {
                    var P = void 0;
                    do {
                        P = Neo.BigInteger.random(this.curve.Q.bitLength());
                    } while (P.compareTo(this.curve.Q) >= 0 || !Neo.BigInteger.modPow(P.multiply(P).subtract(fourQ), legendreExponent, this.curve.Q).equals(qMinusOne));
                    var result = ECFieldElement.fastLucasSequence(this.curve.Q, P, Q, k);
                    U = result[0];
                    V = result[1];
                    if (V.multiply(V).mod(this.curve.Q).equals(fourQ)) {
                        if (V.testBit(0)) {
                            V = V.add(this.curve.Q);
                        }
                        V = V.rightShift(1);
                        console.assert(V.multiply(V).mod(this.curve.Q).equals(this.value));
                        return new ECFieldElement(V, this.curve);
                    }
                } while (U.equals(Neo.BigInteger.One) || U.equals(qMinusOne));
                return null;
            };
            ECFieldElement.prototype.square = function () {
                return new ECFieldElement(this.value.multiply(this.value).mod(this.curve.Q), this.curve);
            };
            ECFieldElement.prototype.subtract = function (other) {
                return new ECFieldElement(this.value.subtract(other.value).mod(this.curve.Q), this.curve);
            };
            return ECFieldElement;
        }());
        Cryptography.ECFieldElement = ECFieldElement;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var ECPoint = (function () {
            function ECPoint(x, y, curve) {
                this.x = x;
                this.y = y;
                this.curve = curve;
                if ((x == null) != (y == null))
                    throw new RangeError("Exactly one of the field elements is null");
            }
            ECPoint.add = function (x, y) {
                if (x.isInfinity())
                    return y;
                if (y.isInfinity())
                    return x;
                if (x.x.equals(y.x)) {
                    if (x.y.equals(y.y))
                        return x.twice();
                    console.assert(x.y.equals(y.y.negate()));
                    return x.curve.Infinity;
                }
                var gamma = y.y.subtract(x.y).divide(y.x.subtract(x.x));
                var x3 = gamma.square().subtract(x.x).subtract(y.x);
                var y3 = gamma.multiply(x.x.subtract(x3)).subtract(x.y);
                return new ECPoint(x3, y3, x.curve);
            };
            ECPoint.prototype.compareTo = function (other) {
                if (this === other)
                    return 0;
                var result = this.x.compareTo(other.x);
                if (result != 0)
                    return result;
                return this.y.compareTo(other.y);
            };
            ECPoint.decodePoint = function (encoded, curve) {
                var p;
                var expectedLength = Math.ceil(curve.Q.bitLength() / 8);
                switch (encoded[0]) {
                    case 0x00:
                        {
                            if (encoded.length != 1)
                                throw new RangeError("Incorrect length for infinity encoding");
                            p = curve.Infinity;
                            break;
                        }
                    case 0x02:
                    case 0x03:
                        {
                            if (encoded.length != (expectedLength + 1))
                                throw new RangeError("Incorrect length for compressed encoding");
                            var yTilde = encoded[0] & 1;
                            var X1 = Neo.BigInteger.fromUint8Array(encoded.subarray(1), 1, false);
                            p = ECPoint.decompressPoint(yTilde, X1, curve);
                            break;
                        }
                    case 0x04:
                    case 0x06:
                    case 0x07:
                        {
                            if (encoded.length != (2 * expectedLength + 1))
                                throw new RangeError("Incorrect length for uncompressed/hybrid encoding");
                            var X1 = Neo.BigInteger.fromUint8Array(encoded.subarray(1, 1 + expectedLength), 1, false);
                            var Y1 = Neo.BigInteger.fromUint8Array(encoded.subarray(1 + expectedLength), 1, false);
                            p = new ECPoint(new Cryptography.ECFieldElement(X1, curve), new Cryptography.ECFieldElement(Y1, curve), curve);
                            break;
                        }
                    default:
                        throw new RangeError("Invalid point encoding " + encoded[0]);
                }
                return p;
            };
            ECPoint.decompressPoint = function (yTilde, X1, curve) {
                var x = new Cryptography.ECFieldElement(X1, curve);
                var alpha = x.multiply(x.square().add(curve.A)).add(curve.B);
                var beta = alpha.sqrt();
                if (beta == null)
                    throw new RangeError("Invalid point compression");
                var betaValue = beta.value;
                var bit0 = betaValue.isEven() ? 0 : 1;
                if (bit0 != yTilde) {
                    beta = new Cryptography.ECFieldElement(curve.Q.subtract(betaValue), curve);
                }
                return new ECPoint(x, beta, curve);
            };
            ECPoint.deserializeFrom = function (reader, curve) {
                var expectedLength = Math.floor((curve.Q.bitLength() + 7) / 8);
                var array = new Uint8Array(1 + expectedLength * 2);
                array[0] = reader.readByte();
                switch (array[0]) {
                    case 0x00:
                        return curve.Infinity;
                    case 0x02:
                    case 0x03:
                        reader.read(array.buffer, 1, expectedLength);
                        return ECPoint.decodePoint(new Uint8Array(array.buffer, 0, 33), curve);
                    case 0x04:
                    case 0x06:
                    case 0x07:
                        reader.read(array.buffer, 1, expectedLength * 2);
                        return ECPoint.decodePoint(array, curve);
                    default:
                        throw new Error("Invalid point encoding " + array[0]);
                }
            };
            ECPoint.prototype.encodePoint = function (commpressed) {
                if (this.isInfinity())
                    return new Uint8Array(1);
                var data;
                if (commpressed) {
                    data = new Uint8Array(33);
                }
                else {
                    data = new Uint8Array(65);
                    var yBytes = this.y.value.toUint8Array();
                    for (var i = 0; i < yBytes.length; i++)
                        data[65 - yBytes.length + i] = yBytes[yBytes.length - 1 - i];
                }
                var xBytes = this.x.value.toUint8Array();
                for (var i = 0; i < xBytes.length; i++)
                    data[33 - xBytes.length + i] = xBytes[xBytes.length - 1 - i];
                data[0] = commpressed ? this.y.value.isEven() ? 0x02 : 0x03 : 0x04;
                return data;
            };
            ECPoint.prototype.equals = function (other) {
                if (this === other)
                    return true;
                if (null === other)
                    return false;
                if (this.isInfinity && other.isInfinity)
                    return true;
                if (this.isInfinity || other.isInfinity)
                    return false;
                return this.x.equals(other.x) && this.y.equals(other.y);
            };
            ECPoint.fromUint8Array = function (arr, curve) {
                switch (arr.length) {
                    case 33:
                    case 65:
                        return ECPoint.decodePoint(arr, curve);
                    case 64:
                    case 72:
                        {
                            var arr_new = new Uint8Array(65);
                            arr_new[0] = 0x04;
                            arr_new.set(arr.subarray(arr.length - 64), 1);
                            return ECPoint.decodePoint(arr_new, curve);
                        }
                    case 96:
                    case 104:
                        {
                            var arr_new = new Uint8Array(65);
                            arr_new[0] = 0x04;
                            arr_new.set(arr.subarray(arr.length - 96, arr.length - 32), 1);
                            return ECPoint.decodePoint(arr_new, curve);
                        }
                    default:
                        throw new RangeError();
                }
            };
            ECPoint.prototype.isInfinity = function () {
                return this.x == null && this.y == null;
            };
            ECPoint.multiply = function (p, n) {
                var k = n instanceof Uint8Array ? Neo.BigInteger.fromUint8Array(n, 1, false) : n;
                if (p.isInfinity())
                    return p;
                if (k.isZero())
                    return p.curve.Infinity;
                var m = k.bitLength();
                var width;
                var reqPreCompLen;
                if (m < 13) {
                    width = 2;
                    reqPreCompLen = 1;
                }
                else if (m < 41) {
                    width = 3;
                    reqPreCompLen = 2;
                }
                else if (m < 121) {
                    width = 4;
                    reqPreCompLen = 4;
                }
                else if (m < 337) {
                    width = 5;
                    reqPreCompLen = 8;
                }
                else if (m < 897) {
                    width = 6;
                    reqPreCompLen = 16;
                }
                else if (m < 2305) {
                    width = 7;
                    reqPreCompLen = 32;
                }
                else {
                    width = 8;
                    reqPreCompLen = 127;
                }
                var preCompLen = 1;
                var preComp = [p];
                var twiceP = p.twice();
                if (preCompLen < reqPreCompLen) {
                    var oldPreComp = preComp;
                    preComp = new Array(reqPreCompLen);
                    for (var i = 0; i < preCompLen; i++)
                        preComp[i] = oldPreComp[i];
                    for (var i = preCompLen; i < reqPreCompLen; i++) {
                        preComp[i] = ECPoint.add(twiceP, preComp[i - 1]);
                    }
                }
                var wnaf = ECPoint.windowNaf(width, k);
                var l = wnaf.length;
                var q = p.curve.Infinity;
                for (var i = l - 1; i >= 0; i--) {
                    q = q.twice();
                    if (wnaf[i] != 0) {
                        if (wnaf[i] > 0) {
                            q = ECPoint.add(q, preComp[Math.floor((wnaf[i] - 1) / 2)]);
                        }
                        else {
                            q = ECPoint.subtract(q, preComp[Math.floor((-wnaf[i] - 1) / 2)]);
                        }
                    }
                }
                return q;
            };
            ECPoint.prototype.negate = function () {
                return new ECPoint(this.x, this.y.negate(), this.curve);
            };
            ECPoint.parse = function (str, curve) {
                return ECPoint.decodePoint(str.hexToBytes(), curve);
            };
            ECPoint.subtract = function (x, y) {
                if (y.isInfinity())
                    return x;
                return ECPoint.add(x, y.negate());
            };
            ECPoint.prototype.toString = function () {
                return this.encodePoint(true).toHexString();
            };
            ECPoint.prototype.twice = function () {
                if (this.isInfinity())
                    return this;
                if (this.y.value.sign() == 0)
                    return this.curve.Infinity;
                var TWO = new Cryptography.ECFieldElement(new Neo.BigInteger(2), this.curve);
                var THREE = new Cryptography.ECFieldElement(new Neo.BigInteger(3), this.curve);
                var gamma = this.x.square().multiply(THREE).add(this.curve.A).divide(this.y.multiply(TWO));
                var x3 = gamma.square().subtract(this.x.multiply(TWO));
                var y3 = gamma.multiply(this.x.subtract(x3)).subtract(this.y);
                return new ECPoint(x3, y3, this.curve);
            };
            ECPoint.windowNaf = function (width, k) {
                var wnaf = new Array(k.bitLength() + 1);
                var pow2wB = 1 << width;
                var i = 0;
                var length = 0;
                while (k.sign() > 0) {
                    if (!k.isEven()) {
                        var remainder = Neo.BigInteger.remainder(k, pow2wB);
                        if (remainder.testBit(width - 1)) {
                            wnaf[i] = Neo.BigInteger.subtract(remainder, pow2wB).toInt32();
                        }
                        else {
                            wnaf[i] = remainder.toInt32();
                        }
                        k = k.subtract(wnaf[i]);
                        length = i;
                    }
                    else {
                        wnaf[i] = 0;
                    }
                    k = k.rightShift(1);
                    i++;
                }
                wnaf.length = length + 1;
                return wnaf;
            };
            return ECPoint;
        }());
        Cryptography.ECPoint = ECPoint;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var RandomNumberGenerator = (function () {
            function RandomNumberGenerator() {
            }
            RandomNumberGenerator.addEntropy = function (data, strength) {
                if (RandomNumberGenerator._stopped)
                    return;
                for (var i = 0; i < data.length; i++)
                    if (data[i] != null && data[i] != 0) {
                        RandomNumberGenerator._entropy.push(data[i]);
                        RandomNumberGenerator._strength += strength;
                        RandomNumberGenerator._key = null;
                    }
                if (RandomNumberGenerator._strength >= 512)
                    RandomNumberGenerator.stopCollectors();
            };
            RandomNumberGenerator.getRandomValues = function (array) {
                if (RandomNumberGenerator._strength < 256)
                    throw new Error();
                if (RandomNumberGenerator._key == null) {
                    var data = new Float64Array(RandomNumberGenerator._entropy);
                    RandomNumberGenerator._key = new Uint8Array(Cryptography.Sha256.computeHash(data));
                }
                var aes = new Cryptography.Aes(RandomNumberGenerator._key, RandomNumberGenerator.getWeakRandomValues(16));
                var src = new Uint8Array(16);
                var dst = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
                for (var i = 0; i < dst.length; i += 16) {
                    aes.encryptBlock(RandomNumberGenerator.getWeakRandomValues(16), src);
                    Array.copy(src, 0, dst, i, Math.min(dst.length - i, 16));
                }
                return array;
            };
            RandomNumberGenerator.getWeakRandomValues = function (array) {
                var buffer = typeof array === "number" ? new Uint8Array(array) : array;
                for (var i = 0; i < buffer.length; i++)
                    buffer[i] = Math.random() * 256;
                return buffer;
            };
            RandomNumberGenerator.processDeviceMotionEvent = function (event) {
                RandomNumberGenerator.addEntropy([event.accelerationIncludingGravity.x, event.accelerationIncludingGravity.y, event.accelerationIncludingGravity.z], 1);
                RandomNumberGenerator.processEvent(event);
            };
            RandomNumberGenerator.processEvent = function (event) {
                if (window.performance && window.performance.now)
                    RandomNumberGenerator.addEntropy([window.performance.now()], 20);
                else
                    RandomNumberGenerator.addEntropy([event.timeStamp], 2);
            };
            RandomNumberGenerator.processMouseEvent = function (event) {
                RandomNumberGenerator.addEntropy([event.clientX, event.clientY, event.offsetX, event.offsetY, event.screenX, event.screenY], 4);
                RandomNumberGenerator.processEvent(event);
            };
            RandomNumberGenerator.processTouchEvent = function (event) {
                var touches = event.changedTouches || event.touches;
                for (var i = 0; i < touches.length; i++)
                    RandomNumberGenerator.addEntropy([touches[i].clientX, touches[i].clientY, touches[i]["radiusX"], touches[i]["radiusY"], touches[i]["force"]], 1);
                RandomNumberGenerator.processEvent(event);
            };
            RandomNumberGenerator.startCollectors = function () {
                if (RandomNumberGenerator._started)
                    return;
                window.addEventListener("load", RandomNumberGenerator.processEvent, false);
                window.addEventListener("mousemove", RandomNumberGenerator.processMouseEvent, false);
                window.addEventListener("keypress", RandomNumberGenerator.processEvent, false);
                window.addEventListener("devicemotion", RandomNumberGenerator.processDeviceMotionEvent, false);
                window.addEventListener("touchmove", RandomNumberGenerator.processTouchEvent, false);
                RandomNumberGenerator._started = true;
            };
            RandomNumberGenerator.stopCollectors = function () {
                if (RandomNumberGenerator._stopped)
                    return;
                window.removeEventListener("load", RandomNumberGenerator.processEvent, false);
                window.removeEventListener("mousemove", RandomNumberGenerator.processMouseEvent, false);
                window.removeEventListener("keypress", RandomNumberGenerator.processEvent, false);
                window.removeEventListener("devicemotion", RandomNumberGenerator.processDeviceMotionEvent, false);
                window.removeEventListener("touchmove", RandomNumberGenerator.processTouchEvent, false);
                RandomNumberGenerator._stopped = true;
            };
            RandomNumberGenerator._entropy = [];
            RandomNumberGenerator._strength = 0;
            RandomNumberGenerator._started = false;
            RandomNumberGenerator._stopped = false;
            return RandomNumberGenerator;
        }());
        Cryptography.RandomNumberGenerator = RandomNumberGenerator;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        String.prototype.base58Decode = function () {
            return Cryptography.Base58.decode(this);
        };
        String.prototype.base64UrlDecode = function () {
            var str = window.atob(this.replace(/-/g, '+').replace(/_/g, '/'));
            var arr = new Uint8Array(str.length);
            for (var i = 0; i < str.length; i++)
                arr[i] = str.charCodeAt(i);
            return arr;
        };
        String.prototype.toAesKey = function () {
            var utf8 = unescape(encodeURIComponent(this));
            var codes = new Uint8Array(utf8.length);
            for (var i = 0; i < codes.length; i++)
                codes[i] = utf8.charCodeAt(i);
            return window.crypto.subtle.digest({ name: "SHA-256" }, codes).then(function (result) {
                return window.crypto.subtle.digest({ name: "SHA-256" }, result);
            });
        };
        Uint8Array.prototype.base58Encode = function () {
            return Cryptography.Base58.encode(this);
        };
        Uint8Array.prototype.base64UrlEncode = function () {
            var str = String.fromCharCode.apply(null, this);
            str = window.btoa(str);
            return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        };
        var getAlgorithmName = function (algorithm) { return typeof algorithm === "string" ? algorithm : algorithm.name; };
        var w = window;
        if (window.crypto == null)
            window.crypto = { subtle: null, getRandomValues: null };
        if (window.crypto.getRandomValues == null) {
            if (w.msCrypto) {
                w.crypto.getRandomValues = function (array) { return w.msCrypto.getRandomValues(array); };
            }
            else {
                Cryptography.RandomNumberGenerator.startCollectors();
                window.crypto.getRandomValues = Cryptography.RandomNumberGenerator.getRandomValues;
            }
        }
        w.crypto.subtle = window.crypto.subtle || w.crypto.webkitSubtle;
        if (window.crypto.subtle == null && w.msCrypto) {
            window.crypto.subtle = {
                decrypt: function (a, b, c) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.decrypt(a, b, c); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                deriveBits: function (a, b, c) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.deriveBits(a, b, c); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                deriveKey: function (a, b, c, d, e) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.deriveKey(a, b, c, d, e); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                digest: function (a, b) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.digest(a, b); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                encrypt: function (a, b, c) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.encrypt(a, b, c); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                exportKey: function (a, b) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.exportKey(a, b); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                generateKey: function (a, b, c) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.generateKey(a, b, c); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                importKey: function (a, b, c, d, e) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.importKey(a, b, c, d, e); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                sign: function (a, b, c) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.sign(a, b, c); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                unwrapKey: function (a, b, c, d, e, f, g) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.unwrapKey(a, b, c, d, e, f, g); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                verify: function (a, b, c, d) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.verify(a, b, c, d); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
                wrapKey: function (a, b, c, d) { return new NeoPromise(function (resolve, reject) { var op = w.msCrypto.subtle.wrapKey(a, b, c, d); op.oncomplete = function () { return resolve(op.result); }; op.onerror = function (e) { return reject(e); }; }); },
            };
        }
        if (window.crypto.subtle == null) {
            window.crypto.subtle = {
                decrypt: function (algorithm, key, data) { return new NeoPromise(function (resolve, reject) {
                    if (typeof algorithm === "string" || algorithm.name != "AES-CBC" || !algorithm.iv || algorithm.iv.byteLength != 16 || data.byteLength % 16 != 0) {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        var aes = new Cryptography.Aes(key.export(), algorithm.iv);
                        resolve(aes.decrypt(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                deriveBits: null,
                deriveKey: null,
                digest: function (algorithm, data) { return new NeoPromise(function (resolve, reject) {
                    if (getAlgorithmName(algorithm) != "SHA-256") {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        resolve(Cryptography.Sha256.computeHash(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                encrypt: function (algorithm, key, data) { return new NeoPromise(function (resolve, reject) {
                    if (typeof algorithm === "string" || algorithm.name != "AES-CBC" || !algorithm.iv || algorithm.iv.byteLength != 16) {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        var aes = new Cryptography.Aes(key.export(), algorithm.iv);
                        resolve(aes.encrypt(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                exportKey: function (format, key) { return new NeoPromise(function (resolve, reject) {
                    if (format != "jwk" || !(key instanceof Cryptography.AesCryptoKey)) {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        var k = key;
                        resolve({
                            alg: "A256CBC",
                            ext: true,
                            k: k.export().base64UrlEncode(),
                            key_ops: k.usages,
                            kty: "oct"
                        });
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                generateKey: function (algorithm, extractable, keyUsages) { return new NeoPromise(function (resolve, reject) {
                    if (typeof algorithm === "string" || algorithm.name != "AES-CBC" || (algorithm.length != 128 && algorithm.length != 192 && algorithm.length != 256)) {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        resolve(Cryptography.AesCryptoKey.create(algorithm.length));
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                importKey: function (format, keyData, algorithm, extractable, keyUsages) { return new NeoPromise(function (resolve, reject) {
                    if ((format != "raw" && format != "jwk") || getAlgorithmName(algorithm) != "AES-CBC") {
                        reject(new RangeError());
                        return;
                    }
                    try {
                        if (format == "jwk")
                            keyData = keyData.k.base64UrlDecode();
                        resolve(Cryptography.AesCryptoKey.import(keyData));
                    }
                    catch (e) {
                        reject(e);
                    }
                }); },
                sign: null,
                unwrapKey: null,
                verify: null,
                wrapKey: null,
            };
        }
        function hook_ripemd160() {
            var digest_old = window.crypto.subtle.digest;
            window.crypto.subtle.digest = function (algorithm, data) {
                if (getAlgorithmName(algorithm) != "RIPEMD-160")
                    return digest_old.call(window.crypto.subtle, algorithm, data);
                return new NeoPromise(function (resolve, reject) {
                    try {
                        resolve(Cryptography.RIPEMD160.computeHash(data));
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            };
        }
        hook_ripemd160();
        function hook_ecdsa() {
            var exportKey_old = window.crypto.subtle.exportKey;
            window.crypto.subtle.exportKey = function (format, key) {
                if (key.algorithm.name != "ECDSA")
                    return exportKey_old.call(window.crypto.subtle, format, key);
                return new NeoPromise(function (resolve, reject) {
                    var k = key;
                    if (format != "jwk" || k.algorithm.namedCurve != "P-256")
                        reject(new RangeError());
                    else
                        try {
                            if (k.type == "private")
                                resolve({
                                    crv: k.algorithm.namedCurve,
                                    d: k.privateKey.base64UrlEncode(),
                                    ext: true,
                                    key_ops: k.usages,
                                    kty: "EC",
                                    x: k.publicKey.x.value.toUint8Array(false, 32).base64UrlEncode(),
                                    y: k.publicKey.y.value.toUint8Array(false, 32).base64UrlEncode()
                                });
                            else
                                resolve({
                                    crv: k.algorithm.namedCurve,
                                    ext: true,
                                    key_ops: k.usages,
                                    kty: "EC",
                                    x: k.publicKey.x.value.toUint8Array(false, 32).base64UrlEncode(),
                                    y: k.publicKey.y.value.toUint8Array(false, 32).base64UrlEncode()
                                });
                        }
                        catch (e) {
                            reject(e);
                        }
                });
            };
            var generateKey_old = window.crypto.subtle.generateKey;
            window.crypto.subtle.generateKey = function (algorithm, extractable, keyUsages) {
                if (getAlgorithmName(algorithm) != "ECDSA")
                    return generateKey_old.call(window.crypto.subtle, algorithm, extractable, keyUsages);
                return new NeoPromise(function (resolve, reject) {
                    if (algorithm.namedCurve != "P-256")
                        reject(new RangeError());
                    else
                        try {
                            resolve(Cryptography.ECDsa.generateKey(Cryptography.ECCurve.secp256r1));
                        }
                        catch (e) {
                            reject(e);
                        }
                });
            };
            var importKey_old = window.crypto.subtle.importKey;
            window.crypto.subtle.importKey = function (format, keyData, algorithm, extractable, keyUsages) {
                if (getAlgorithmName(algorithm) != "ECDSA")
                    return importKey_old.call(window.crypto.subtle, format, keyData, algorithm, extractable, keyUsages);
                return new NeoPromise(function (resolve, reject) {
                    if (format != "jwk" || algorithm.namedCurve != "P-256")
                        reject(new RangeError());
                    else
                        try {
                            var k = keyData;
                            var x = k.x.base64UrlDecode();
                            var y = k.y.base64UrlDecode();
                            var arr = new Uint8Array(65);
                            arr[0] = 0x04;
                            Array.copy(x, 0, arr, 1, 32);
                            Array.copy(y, 0, arr, 33, 32);
                            var pubkey = Cryptography.ECPoint.decodePoint(arr, Cryptography.ECCurve.secp256r1);
                            if (k.d)
                                resolve(new Cryptography.ECDsaCryptoKey(pubkey, k.d.base64UrlDecode()));
                            else
                                resolve(new Cryptography.ECDsaCryptoKey(pubkey));
                        }
                        catch (e) {
                            reject(e);
                        }
                });
            };
            var sign_old = window.crypto.subtle.sign;
            window.crypto.subtle.sign = function (algorithm, key, data) {
                if (getAlgorithmName(algorithm) != "ECDSA")
                    return sign_old.call(window.crypto.subtle, algorithm, key, data);
                return new NeoPromise(function (resolve, reject) {
                    if (algorithm.hash.name != "SHA-256" || key.algorithm.name != "ECDSA")
                        reject(new RangeError());
                    else
                        try {
                            var ecdsa = new Cryptography.ECDsa(key);
                            resolve(ecdsa.sign(data));
                        }
                        catch (e) {
                            reject(e);
                        }
                });
            };
            var verify_old = window.crypto.subtle.verify;
            window.crypto.subtle.verify = function (algorithm, key, signature, data) {
                if (getAlgorithmName(algorithm) != "ECDSA")
                    return verify_old.call(window.crypto.subtle, algorithm, key, signature, data);
                return new NeoPromise(function (resolve, reject) {
                    if (algorithm.hash.name != "SHA-256" || key.algorithm.name != "ECDSA")
                        reject(new RangeError());
                    else
                        try {
                            var ecdsa = new Cryptography.ECDsa(key);
                            resolve(ecdsa.verify(data, signature));
                        }
                        catch (e) {
                            reject(e);
                        }
                });
            };
        }
        try {
            window.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]).catch(hook_ecdsa);
        }
        catch (ex) {
            hook_ecdsa();
        }
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var RIPEMD160 = (function () {
            function RIPEMD160() {
            }
            RIPEMD160.bytesToWords = function (bytes) {
                var words = [];
                for (var i = 0, b = 0; i < bytes.length; i++, b += 8) {
                    words[b >>> 5] |= bytes[i] << (24 - b % 32);
                }
                return words;
            };
            RIPEMD160.wordsToBytes = function (words) {
                var bytes = [];
                for (var b = 0; b < words.length * 32; b += 8) {
                    bytes.push((words[b >>> 5] >>> (24 - b % 32)) & 0xFF);
                }
                return bytes;
            };
            RIPEMD160.processBlock = function (H, M, offset) {
                for (var i = 0; i < 16; i++) {
                    var offset_i = offset + i;
                    var M_offset_i = M[offset_i];
                    M[offset_i] = ((((M_offset_i << 8) | (M_offset_i >>> 24)) & 0x00ff00ff) |
                        (((M_offset_i << 24) | (M_offset_i >>> 8)) & 0xff00ff00));
                }
                var al, bl, cl, dl, el;
                var ar, br, cr, dr, er;
                ar = al = H[0];
                br = bl = H[1];
                cr = cl = H[2];
                dr = dl = H[3];
                er = el = H[4];
                var t;
                for (var i = 0; i < 80; i += 1) {
                    t = (al + M[offset + RIPEMD160.zl[i]]) | 0;
                    if (i < 16) {
                        t += RIPEMD160.f1(bl, cl, dl) + RIPEMD160.hl[0];
                    }
                    else if (i < 32) {
                        t += RIPEMD160.f2(bl, cl, dl) + RIPEMD160.hl[1];
                    }
                    else if (i < 48) {
                        t += RIPEMD160.f3(bl, cl, dl) + RIPEMD160.hl[2];
                    }
                    else if (i < 64) {
                        t += RIPEMD160.f4(bl, cl, dl) + RIPEMD160.hl[3];
                    }
                    else {
                        t += RIPEMD160.f5(bl, cl, dl) + RIPEMD160.hl[4];
                    }
                    t = t | 0;
                    t = RIPEMD160.rotl(t, RIPEMD160.sl[i]);
                    t = (t + el) | 0;
                    al = el;
                    el = dl;
                    dl = RIPEMD160.rotl(cl, 10);
                    cl = bl;
                    bl = t;
                    t = (ar + M[offset + RIPEMD160.zr[i]]) | 0;
                    if (i < 16) {
                        t += RIPEMD160.f5(br, cr, dr) + RIPEMD160.hr[0];
                    }
                    else if (i < 32) {
                        t += RIPEMD160.f4(br, cr, dr) + RIPEMD160.hr[1];
                    }
                    else if (i < 48) {
                        t += RIPEMD160.f3(br, cr, dr) + RIPEMD160.hr[2];
                    }
                    else if (i < 64) {
                        t += RIPEMD160.f2(br, cr, dr) + RIPEMD160.hr[3];
                    }
                    else {
                        t += RIPEMD160.f1(br, cr, dr) + RIPEMD160.hr[4];
                    }
                    t = t | 0;
                    t = RIPEMD160.rotl(t, RIPEMD160.sr[i]);
                    t = (t + er) | 0;
                    ar = er;
                    er = dr;
                    dr = RIPEMD160.rotl(cr, 10);
                    cr = br;
                    br = t;
                }
                t = (H[1] + cl + dr) | 0;
                H[1] = (H[2] + dl + er) | 0;
                H[2] = (H[3] + el + ar) | 0;
                H[3] = (H[4] + al + br) | 0;
                H[4] = (H[0] + bl + cr) | 0;
                H[0] = t;
            };
            RIPEMD160.f1 = function (x, y, z) { return ((x) ^ (y) ^ (z)); };
            RIPEMD160.f2 = function (x, y, z) { return (((x) & (y)) | ((~x) & (z))); };
            RIPEMD160.f3 = function (x, y, z) { return (((x) | (~(y))) ^ (z)); };
            RIPEMD160.f4 = function (x, y, z) { return (((x) & (z)) | ((y) & (~(z)))); };
            RIPEMD160.f5 = function (x, y, z) { return ((x) ^ ((y) | (~(z)))); };
            RIPEMD160.rotl = function (x, n) { return (x << n) | (x >>> (32 - n)); };
            RIPEMD160.computeHash = function (data) {
                var H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
                var m = RIPEMD160.bytesToWords(Uint8Array.fromArrayBuffer(data));
                var nBitsLeft = data.byteLength * 8;
                var nBitsTotal = data.byteLength * 8;
                m[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
                m[(((nBitsLeft + 64) >>> 9) << 4) + 14] = ((((nBitsTotal << 8) | (nBitsTotal >>> 24)) & 0x00ff00ff) |
                    (((nBitsTotal << 24) | (nBitsTotal >>> 8)) & 0xff00ff00));
                for (var i = 0; i < m.length; i += 16) {
                    RIPEMD160.processBlock(H, m, i);
                }
                for (var i = 0; i < 5; i++) {
                    var H_i = H[i];
                    H[i] = (((H_i << 8) | (H_i >>> 24)) & 0x00ff00ff) |
                        (((H_i << 24) | (H_i >>> 8)) & 0xff00ff00);
                }
                var digestbytes = RIPEMD160.wordsToBytes(H);
                return new Uint8Array(digestbytes).buffer;
            };
            RIPEMD160.zl = [
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
                3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
                1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
                4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
            ];
            RIPEMD160.zr = [
                5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
                6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
                15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
                8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
                12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
            ];
            RIPEMD160.sl = [
                11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
                7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
                11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
                11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
                9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
            ];
            RIPEMD160.sr = [
                8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
                9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
                9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
                15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
                8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
            ];
            RIPEMD160.hl = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E];
            RIPEMD160.hr = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000];
            return RIPEMD160;
        }());
        Cryptography.RIPEMD160 = RIPEMD160;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var Cryptography;
    (function (Cryptography) {
        var Sha256 = (function () {
            function Sha256() {
            }
            Sha256.computeHash = function (data) {
                var H = new Uint32Array([
                    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
                ]);
                var l = data.byteLength / 4 + 2;
                var N = Math.ceil(l / 16);
                var M = new Array(N);
                var view = Uint8Array.fromArrayBuffer(data);
                for (var i = 0; i < N; i++) {
                    M[i] = new Uint32Array(16);
                    for (var j = 0; j < 16; j++) {
                        M[i][j] = (view[i * 64 + j * 4] << 24) | (view[i * 64 + j * 4 + 1] << 16) |
                            (view[i * 64 + j * 4 + 2] << 8) | (view[i * 64 + j * 4 + 3]);
                    }
                }
                M[Math.floor(data.byteLength / 4 / 16)][Math.floor(data.byteLength / 4) % 16] |= 0x80 << ((3 - data.byteLength % 4) * 8);
                M[N - 1][14] = (data.byteLength * 8) / Math.pow(2, 32);
                M[N - 1][15] = (data.byteLength * 8) & 0xffffffff;
                var W = new Uint32Array(64);
                var a, b, c, d, e, f, g, h;
                for (var i = 0; i < N; i++) {
                    for (var t = 0; t < 16; t++)
                        W[t] = M[i][t];
                    for (var t = 16; t < 64; t++)
                        W[t] = (Sha256.σ1(W[t - 2]) + W[t - 7] + Sha256.σ0(W[t - 15]) + W[t - 16]) & 0xffffffff;
                    a = H[0];
                    b = H[1];
                    c = H[2];
                    d = H[3];
                    e = H[4];
                    f = H[5];
                    g = H[6];
                    h = H[7];
                    for (var t = 0; t < 64; t++) {
                        var T1 = h + Sha256.Σ1(e) + Sha256.Ch(e, f, g) + Sha256.K[t] + W[t];
                        var T2 = Sha256.Σ0(a) + Sha256.Maj(a, b, c);
                        h = g;
                        g = f;
                        f = e;
                        e = (d + T1) & 0xffffffff;
                        d = c;
                        c = b;
                        b = a;
                        a = (T1 + T2) & 0xffffffff;
                    }
                    H[0] = (H[0] + a) & 0xffffffff;
                    H[1] = (H[1] + b) & 0xffffffff;
                    H[2] = (H[2] + c) & 0xffffffff;
                    H[3] = (H[3] + d) & 0xffffffff;
                    H[4] = (H[4] + e) & 0xffffffff;
                    H[5] = (H[5] + f) & 0xffffffff;
                    H[6] = (H[6] + g) & 0xffffffff;
                    H[7] = (H[7] + h) & 0xffffffff;
                }
                var result = new Uint8Array(32);
                for (var i = 0; i < H.length; i++) {
                    result[i * 4 + 0] = (H[i] >>> (3 * 8)) & 0xff;
                    result[i * 4 + 1] = (H[i] >>> (2 * 8)) & 0xff;
                    result[i * 4 + 2] = (H[i] >>> (1 * 8)) & 0xff;
                    result[i * 4 + 3] = (H[i] >>> (0 * 8)) & 0xff;
                }
                return result.buffer;
            };
            Sha256.ROTR = function (n, x) { return (x >>> n) | (x << (32 - n)); };
            Sha256.Σ0 = function (x) { return Sha256.ROTR(2, x) ^ Sha256.ROTR(13, x) ^ Sha256.ROTR(22, x); };
            Sha256.Σ1 = function (x) { return Sha256.ROTR(6, x) ^ Sha256.ROTR(11, x) ^ Sha256.ROTR(25, x); };
            Sha256.σ0 = function (x) { return Sha256.ROTR(7, x) ^ Sha256.ROTR(18, x) ^ (x >>> 3); };
            Sha256.σ1 = function (x) { return Sha256.ROTR(17, x) ^ Sha256.ROTR(19, x) ^ (x >>> 10); };
            Sha256.Ch = function (x, y, z) { return (x & y) ^ (~x & z); };
            Sha256.Maj = function (x, y, z) { return (x & y) ^ (x & z) ^ (y & z); };
            Sha256.K = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ];
            return Sha256;
        }());
        Cryptography.Sha256 = Sha256;
    })(Cryptography = Neo.Cryptography || (Neo.Cryptography = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var BinaryReader = (function () {
            function BinaryReader(input) {
                this.input = input;
                this._buffer = new ArrayBuffer(8);
            }
            BinaryReader.prototype.canRead = function () {
                return this.input.length() - this.input.position();
            };
            BinaryReader.prototype.close = function () {
            };
            BinaryReader.prototype.fillBuffer = function (buffer, count) {
                var i = 0;
                while (count > 0) {
                    var actual_count = this.input.read(buffer, 0, count);
                    if (actual_count == 0)
                        throw new Error("EOF");
                    i += actual_count;
                    count -= actual_count;
                }
            };
            BinaryReader.prototype.read = function (buffer, index, count) {
                return this.input.read(buffer, index, count);
            };
            BinaryReader.prototype.readBoolean = function () {
                return this.readByte() != 0;
            };
            BinaryReader.prototype.readByte = function () {
                this.fillBuffer(this._buffer, 1);
                if (this.array_uint8 == null)
                    this.array_uint8 = new Uint8Array(this._buffer, 0, 1);
                return this.array_uint8[0];
            };
            BinaryReader.prototype.readBytes = function (count) {
                var buffer = new ArrayBuffer(count);
                this.fillBuffer(buffer, count);
                return buffer;
            };
            BinaryReader.prototype.readDouble = function () {
                this.fillBuffer(this._buffer, 8);
                if (this.array_float64 == null)
                    this.array_float64 = new Float64Array(this._buffer, 0, 1);
                return this.array_float64[0];
            };
            BinaryReader.prototype.readFixed8 = function () {
                return new Neo.Fixed8(this.readUint64());
            };
            BinaryReader.prototype.readInt16 = function () {
                this.fillBuffer(this._buffer, 2);
                if (this.array_int16 == null)
                    this.array_int16 = new Int16Array(this._buffer, 0, 1);
                return this.array_int16[0];
            };
            BinaryReader.prototype.readInt32 = function () {
                this.fillBuffer(this._buffer, 4);
                if (this.array_int32 == null)
                    this.array_int32 = new Int32Array(this._buffer, 0, 1);
                return this.array_int32[0];
            };
            BinaryReader.prototype.readSByte = function () {
                this.fillBuffer(this._buffer, 1);
                if (this.array_int8 == null)
                    this.array_int8 = new Int8Array(this._buffer, 0, 1);
                return this.array_int8[0];
            };
            BinaryReader.prototype.readSerializable = function (T) {
                var obj = new T();
                obj.deserialize(this);
                return obj;
            };
            BinaryReader.prototype.readSerializableArray = function (T) {
                var array = new Array(this.readVarInt(0x10000000));
                for (var i = 0; i < array.length; i++)
                    array[i] = this.readSerializable(T);
                return array;
            };
            BinaryReader.prototype.readSingle = function () {
                this.fillBuffer(this._buffer, 4);
                if (this.array_float32 == null)
                    this.array_float32 = new Float32Array(this._buffer, 0, 1);
                return this.array_float32[0];
            };
            BinaryReader.prototype.readUint16 = function () {
                this.fillBuffer(this._buffer, 2);
                if (this.array_uint16 == null)
                    this.array_uint16 = new Uint16Array(this._buffer, 0, 1);
                return this.array_uint16[0];
            };
            BinaryReader.prototype.readUint160 = function () {
                return new Neo.Uint160(this.readBytes(20));
            };
            BinaryReader.prototype.readUint256 = function () {
                return new Neo.Uint256(this.readBytes(32));
            };
            BinaryReader.prototype.readUint32 = function () {
                this.fillBuffer(this._buffer, 4);
                if (this.array_uint32 == null)
                    this.array_uint32 = new Uint32Array(this._buffer, 0, 1);
                return this.array_uint32[0];
            };
            BinaryReader.prototype.readUint64 = function () {
                this.fillBuffer(this._buffer, 8);
                if (this.array_uint32 == null)
                    this.array_uint32 = new Uint32Array(this._buffer, 0, 2);
                return new Neo.Uint64(this.array_uint32[0], this.array_uint32[1]);
            };
            BinaryReader.prototype.readVarBytes = function (max) {
                if (max === void 0) { max = 0X7fffffc7; }
                return this.readBytes(this.readVarInt(max));
            };
            BinaryReader.prototype.readVarInt = function (max) {
                if (max === void 0) { max = 9007199254740991; }
                var fb = this.readByte();
                var value;
                if (fb == 0xfd)
                    value = this.readUint16();
                else if (fb == 0xfe)
                    value = this.readUint32();
                else if (fb == 0xff)
                    value = this.readUint64().toNumber();
                else
                    value = fb;
                if (value > max)
                    throw new RangeError();
                return value;
            };
            BinaryReader.prototype.readVarString = function () {
                return decodeURIComponent(escape(String.fromCharCode.apply(null, new Uint8Array(this.readVarBytes()))));
            };
            return BinaryReader;
        }());
        IO.BinaryReader = BinaryReader;
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var BinaryWriter = (function () {
            function BinaryWriter(output) {
                this.output = output;
                this._buffer = new ArrayBuffer(8);
            }
            BinaryWriter.prototype.close = function () {
            };
            BinaryWriter.prototype.seek = function (offset, origin) {
                return this.output.seek(offset, origin);
            };
            BinaryWriter.prototype.write = function (buffer, index, count) {
                if (index === void 0) { index = 0; }
                if (count === void 0) { count = buffer.byteLength - index; }
                this.output.write(buffer, index, count);
            };
            BinaryWriter.prototype.writeBoolean = function (value) {
                this.writeByte(value ? 0xff : 0);
            };
            BinaryWriter.prototype.writeByte = function (value) {
                if (this.array_uint8 == null)
                    this.array_uint8 = new Uint8Array(this._buffer, 0, 1);
                this.array_uint8[0] = value;
                this.output.write(this._buffer, 0, 1);
            };
            BinaryWriter.prototype.writeDouble = function (value) {
                if (this.array_float64 == null)
                    this.array_float64 = new Float64Array(this._buffer, 0, 1);
                this.array_float64[0] = value;
                this.output.write(this._buffer, 0, 8);
            };
            BinaryWriter.prototype.writeInt16 = function (value) {
                if (this.array_int16 == null)
                    this.array_int16 = new Int16Array(this._buffer, 0, 1);
                this.array_int16[0] = value;
                this.output.write(this._buffer, 0, 2);
            };
            BinaryWriter.prototype.writeInt32 = function (value) {
                if (this.array_int32 == null)
                    this.array_int32 = new Int32Array(this._buffer, 0, 1);
                this.array_int32[0] = value;
                this.output.write(this._buffer, 0, 4);
            };
            BinaryWriter.prototype.writeSByte = function (value) {
                if (this.array_int8 == null)
                    this.array_int8 = new Int8Array(this._buffer, 0, 1);
                this.array_int8[0] = value;
                this.output.write(this._buffer, 0, 1);
            };
            BinaryWriter.prototype.writeSerializableArray = function (array) {
                this.writeVarInt(array.length);
                for (var i = 0; i < array.length; i++)
                    array[i].serialize(this);
            };
            BinaryWriter.prototype.writeSingle = function (value) {
                if (this.array_float32 == null)
                    this.array_float32 = new Float32Array(this._buffer, 0, 1);
                this.array_float32[0] = value;
                this.output.write(this._buffer, 0, 4);
            };
            BinaryWriter.prototype.writeUint16 = function (value) {
                if (this.array_uint16 == null)
                    this.array_uint16 = new Uint16Array(this._buffer, 0, 1);
                this.array_uint16[0] = value;
                this.output.write(this._buffer, 0, 2);
            };
            BinaryWriter.prototype.writeUint32 = function (value) {
                if (this.array_uint32 == null)
                    this.array_uint32 = new Uint32Array(this._buffer, 0, 1);
                this.array_uint32[0] = value;
                this.output.write(this._buffer, 0, 4);
            };
            BinaryWriter.prototype.writeUint64 = function (value) {
                this.writeUintVariable(value);
            };
            BinaryWriter.prototype.writeUintVariable = function (value) {
                this.write(value.bits.buffer);
            };
            BinaryWriter.prototype.writeVarBytes = function (value) {
                this.writeVarInt(value.byteLength);
                this.output.write(value, 0, value.byteLength);
            };
            BinaryWriter.prototype.writeVarInt = function (value) {
                if (value < 0)
                    throw new RangeError();
                if (value < 0xfd) {
                    this.writeByte(value);
                }
                else if (value <= 0xffff) {
                    this.writeByte(0xfd);
                    this.writeUint16(value);
                }
                else if (value <= 0xFFFFFFFF) {
                    this.writeByte(0xfe);
                    this.writeUint32(value);
                }
                else {
                    this.writeByte(0xff);
                    this.writeUint32(value);
                    this.writeUint32(value / Math.pow(2, 32));
                }
            };
            BinaryWriter.prototype.writeVarString = function (value) {
                value = unescape(encodeURIComponent(value));
                var codes = new Uint8Array(value.length);
                for (var i = 0; i < codes.length; i++)
                    codes[i] = value.charCodeAt(i);
                this.writeVarBytes(codes.buffer);
            };
            return BinaryWriter;
        }());
        IO.BinaryWriter = BinaryWriter;
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
Uint8Array.prototype.asSerializable = function (T) {
    var ms = new Neo.IO.MemoryStream(this.buffer, false);
    var reader = new Neo.IO.BinaryReader(ms);
    return reader.readSerializable(T);
};
Uint8Array.fromSerializable = function (obj) {
    var ms = new Neo.IO.MemoryStream();
    var writer = new Neo.IO.BinaryWriter(ms);
    obj.serialize(writer);
    return new Uint8Array(ms.toArray());
};
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var SeekOrigin;
        (function (SeekOrigin) {
            SeekOrigin[SeekOrigin["Begin"] = 0] = "Begin";
            SeekOrigin[SeekOrigin["Current"] = 1] = "Current";
            SeekOrigin[SeekOrigin["End"] = 2] = "End";
        })(SeekOrigin = IO.SeekOrigin || (IO.SeekOrigin = {}));
        var Stream = (function () {
            function Stream() {
                this._array = new Uint8Array(1);
            }
            Stream.prototype.close = function () { };
            Stream.prototype.readByte = function () {
                if (this.read(this._array.buffer, 0, 1) == 0)
                    return -1;
                return this._array[0];
            };
            Stream.prototype.writeByte = function (value) {
                if (value < 0 || value > 255)
                    throw new RangeError();
                this._array[0] = value;
                this.write(this._array.buffer, 0, 1);
            };
            return Stream;
        }());
        IO.Stream = Stream;
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var BufferSize = 1024;
        var MemoryStream = (function (_super) {
            __extends(MemoryStream, _super);
            function MemoryStream() {
                var _this = _super.call(this) || this;
                _this._buffers = new Array();
                _this._origin = 0;
                _this._position = 0;
                if (arguments.length == 0) {
                    _this._length = 0;
                    _this._capacity = 0;
                    _this._expandable = true;
                    _this._writable = true;
                }
                else if (arguments.length == 1 && typeof arguments[0] === "number") {
                    _this._length = 0;
                    _this._capacity = arguments[0];
                    _this._expandable = true;
                    _this._writable = true;
                    _this._buffers.push(new ArrayBuffer(_this._capacity));
                }
                else {
                    var buffer = arguments[0];
                    _this._buffers.push(buffer);
                    _this._expandable = false;
                    if (arguments.length == 1) {
                        _this._writable = false;
                        _this._length = buffer.byteLength;
                    }
                    else if (typeof arguments[1] === "boolean") {
                        _this._writable = arguments[1];
                        _this._length = buffer.byteLength;
                    }
                    else {
                        _this._origin = arguments[1];
                        _this._length = arguments[2];
                        _this._writable = arguments.length == 4 ? arguments[3] : false;
                        if (_this._origin < 0 || _this._origin + _this._length > buffer.byteLength)
                            throw new RangeError();
                    }
                    _this._capacity = _this._length;
                }
                return _this;
            }
            MemoryStream.prototype.canRead = function () {
                return true;
            };
            MemoryStream.prototype.canSeek = function () {
                return true;
            };
            MemoryStream.prototype.canWrite = function () {
                return this._writable;
            };
            MemoryStream.prototype.capacity = function () {
                return this._capacity;
            };
            MemoryStream.prototype.findBuffer = function (position) {
                var iBuff, pBuff;
                var firstSize = this._buffers[0] == null ? BufferSize : this._buffers[0].byteLength;
                if (position < firstSize) {
                    iBuff = 0;
                    pBuff = position;
                }
                else {
                    iBuff = Math.floor((position - firstSize) / BufferSize) + 1;
                    pBuff = (position - firstSize) % BufferSize;
                }
                return { iBuff: iBuff, pBuff: pBuff };
            };
            MemoryStream.prototype.length = function () {
                return this._length;
            };
            MemoryStream.prototype.position = function () {
                return this._position;
            };
            MemoryStream.prototype.read = function (buffer, offset, count) {
                if (this._position + count > this._length)
                    count = this._length - this._position;
                this.readInternal(new Uint8Array(buffer, offset, count), this._position);
                this._position += count;
                return count;
            };
            MemoryStream.prototype.readInternal = function (dst, srcPos) {
                if (this._expandable) {
                    var i = 0, count = dst.length;
                    var d = this.findBuffer(srcPos);
                    while (count > 0) {
                        var actual_count = void 0;
                        if (this._buffers[d.iBuff] == null) {
                            actual_count = Math.min(count, BufferSize - d.pBuff);
                            dst.fill(0, i, i + actual_count);
                        }
                        else {
                            actual_count = Math.min(count, this._buffers[d.iBuff].byteLength - d.pBuff);
                            var src = new Uint8Array(this._buffers[d.iBuff]);
                            Array.copy(src, d.pBuff, dst, i, actual_count);
                        }
                        i += actual_count;
                        count -= actual_count;
                        d.iBuff++;
                        d.pBuff = 0;
                    }
                }
                else {
                    var src = new Uint8Array(this._buffers[0], this._origin, this._length);
                    Array.copy(src, srcPos, dst, 0, dst.length);
                }
            };
            MemoryStream.prototype.seek = function (offset, origin) {
                switch (origin) {
                    case IO.SeekOrigin.Begin:
                        break;
                    case IO.SeekOrigin.Current:
                        offset += this._position;
                        break;
                    case IO.SeekOrigin.End:
                        offset += this._length;
                        break;
                    default:
                        throw new RangeError();
                }
                if (offset < 0 || offset > this._length)
                    throw new RangeError();
                this._position = offset;
                return offset;
            };
            MemoryStream.prototype.setLength = function (value) {
                if (value < 0 || (value != this._length && !this._writable) || (value > this._capacity && !this._expandable))
                    throw new RangeError();
                this._length = value;
                if (this._position > this._length)
                    this._position = this._length;
                if (this._capacity < this._length)
                    this._capacity = this._length;
            };
            MemoryStream.prototype.toArray = function () {
                if (this._buffers.length == 1 && this._origin == 0 && this._length == this._buffers[0].byteLength)
                    return this._buffers[0];
                var bw = new Uint8Array(this._length);
                this.readInternal(bw, 0);
                return bw.buffer;
            };
            MemoryStream.prototype.write = function (buffer, offset, count) {
                if (!this._writable || (!this._expandable && this._capacity - this._position < count))
                    throw new Error();
                if (this._expandable) {
                    var src = new Uint8Array(buffer);
                    var d = this.findBuffer(this._position);
                    while (count > 0) {
                        if (this._buffers[d.iBuff] == null)
                            this._buffers[d.iBuff] = new ArrayBuffer(BufferSize);
                        var actual_count = Math.min(count, this._buffers[d.iBuff].byteLength - d.pBuff);
                        var dst = new Uint8Array(this._buffers[d.iBuff]);
                        Array.copy(src, offset, dst, d.pBuff, actual_count);
                        this._position += actual_count;
                        offset += actual_count;
                        count -= actual_count;
                        d.iBuff++;
                        d.pBuff = 0;
                    }
                }
                else {
                    var src = new Uint8Array(buffer, offset, count);
                    var dst = new Uint8Array(this._buffers[0], this._origin, this._capacity);
                    Array.copy(src, 0, dst, this._position, count);
                    this._position += count;
                }
                if (this._length < this._position)
                    this._length = this._position;
                if (this._capacity < this._length)
                    this._capacity = this._length;
            };
            return MemoryStream;
        }(IO.Stream));
        IO.MemoryStream = MemoryStream;
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
var ThinNeo;
(function (ThinNeo) {
    var Compiler;
    (function (Compiler) {
        var Avm2Asm = (function () {
            function Avm2Asm() {
            }
            Avm2Asm.Trans = function (script) {
                var breader = new Compiler.ByteReader(script);
                var arr = new Array();
                while (breader.End == false) {
                    var o = new Compiler.Op();
                    o.addr = breader.addr;
                    o.code = breader.ReadOP();
                    try {
                        if (o.code >= ThinNeo.OpCode.PUSHBYTES1 && o.code <= ThinNeo.OpCode.PUSHBYTES75) {
                            o.paramType = Compiler.ParamType.ByteArray;
                            var _count = o.code;
                            o.paramData = breader.ReadBytes(_count);
                        }
                        else {
                            switch (o.code) {
                                case ThinNeo.OpCode.PUSH0:
                                case ThinNeo.OpCode.PUSHM1:
                                case ThinNeo.OpCode.PUSH1:
                                case ThinNeo.OpCode.PUSH2:
                                case ThinNeo.OpCode.PUSH3:
                                case ThinNeo.OpCode.PUSH4:
                                case ThinNeo.OpCode.PUSH5:
                                case ThinNeo.OpCode.PUSH6:
                                case ThinNeo.OpCode.PUSH7:
                                case ThinNeo.OpCode.PUSH8:
                                case ThinNeo.OpCode.PUSH9:
                                case ThinNeo.OpCode.PUSH10:
                                case ThinNeo.OpCode.PUSH11:
                                case ThinNeo.OpCode.PUSH12:
                                case ThinNeo.OpCode.PUSH13:
                                case ThinNeo.OpCode.PUSH14:
                                case ThinNeo.OpCode.PUSH15:
                                case ThinNeo.OpCode.PUSH16:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.PUSHDATA1:
                                    {
                                        o.paramType = Compiler.ParamType.ByteArray;
                                        var _count = breader.ReadByte();
                                        o.paramData = breader.ReadBytes(_count);
                                    }
                                    break;
                                case ThinNeo.OpCode.PUSHDATA2:
                                    {
                                        o.paramType = Compiler.ParamType.ByteArray;
                                        var _count = breader.ReadUInt16();
                                        o.paramData = breader.ReadBytes(_count);
                                    }
                                    break;
                                case ThinNeo.OpCode.PUSHDATA4:
                                    {
                                        o.paramType = Compiler.ParamType.ByteArray;
                                        var _count = breader.ReadInt32();
                                        o.paramData = breader.ReadBytes(_count);
                                    }
                                    break;
                                case ThinNeo.OpCode.NOP:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.JMP:
                                case ThinNeo.OpCode.JMPIF:
                                case ThinNeo.OpCode.JMPIFNOT:
                                    o.paramType = Compiler.ParamType.Addr;
                                    o.paramData = breader.ReadBytes(2);
                                    break;
                                case ThinNeo.OpCode.CALL:
                                    o.paramType = Compiler.ParamType.Addr;
                                    o.paramData = breader.ReadBytes(2);
                                    break;
                                case ThinNeo.OpCode.RET:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.APPCALL:
                                case ThinNeo.OpCode.TAILCALL:
                                    o.paramType = Compiler.ParamType.ByteArray;
                                    o.paramData = breader.ReadBytes(20);
                                    break;
                                case ThinNeo.OpCode.SYSCALL:
                                    o.paramType = Compiler.ParamType.String;
                                    o.paramData = breader.ReadVarBytes();
                                    break;
                                case ThinNeo.OpCode.DUPFROMALTSTACK:
                                case ThinNeo.OpCode.TOALTSTACK:
                                case ThinNeo.OpCode.FROMALTSTACK:
                                case ThinNeo.OpCode.XDROP:
                                case ThinNeo.OpCode.XSWAP:
                                case ThinNeo.OpCode.XTUCK:
                                case ThinNeo.OpCode.DEPTH:
                                case ThinNeo.OpCode.DROP:
                                case ThinNeo.OpCode.DUP:
                                case ThinNeo.OpCode.NIP:
                                case ThinNeo.OpCode.OVER:
                                case ThinNeo.OpCode.PICK:
                                case ThinNeo.OpCode.ROLL:
                                case ThinNeo.OpCode.ROT:
                                case ThinNeo.OpCode.SWAP:
                                case ThinNeo.OpCode.TUCK:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.CAT:
                                case ThinNeo.OpCode.SUBSTR:
                                case ThinNeo.OpCode.LEFT:
                                case ThinNeo.OpCode.RIGHT:
                                case ThinNeo.OpCode.SIZE:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.INVERT:
                                case ThinNeo.OpCode.AND:
                                case ThinNeo.OpCode.OR:
                                case ThinNeo.OpCode.XOR:
                                case ThinNeo.OpCode.EQUAL:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.INC:
                                case ThinNeo.OpCode.DEC:
                                case ThinNeo.OpCode.SIGN:
                                case ThinNeo.OpCode.NEGATE:
                                case ThinNeo.OpCode.ABS:
                                case ThinNeo.OpCode.NOT:
                                case ThinNeo.OpCode.NZ:
                                case ThinNeo.OpCode.ADD:
                                case ThinNeo.OpCode.SUB:
                                case ThinNeo.OpCode.MUL:
                                case ThinNeo.OpCode.DIV:
                                case ThinNeo.OpCode.MOD:
                                case ThinNeo.OpCode.SHL:
                                case ThinNeo.OpCode.SHR:
                                case ThinNeo.OpCode.BOOLAND:
                                case ThinNeo.OpCode.BOOLOR:
                                case ThinNeo.OpCode.NUMEQUAL:
                                case ThinNeo.OpCode.NUMNOTEQUAL:
                                case ThinNeo.OpCode.LT:
                                case ThinNeo.OpCode.GT:
                                case ThinNeo.OpCode.LTE:
                                case ThinNeo.OpCode.GTE:
                                case ThinNeo.OpCode.MIN:
                                case ThinNeo.OpCode.MAX:
                                case ThinNeo.OpCode.WITHIN:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.SHA1:
                                case ThinNeo.OpCode.SHA256:
                                case ThinNeo.OpCode.HASH160:
                                case ThinNeo.OpCode.HASH256:
                                case ThinNeo.OpCode.CSHARPSTRHASH32:
                                case ThinNeo.OpCode.JAVAHASH32:
                                case ThinNeo.OpCode.CHECKSIG:
                                case ThinNeo.OpCode.CHECKMULTISIG:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.ARRAYSIZE:
                                case ThinNeo.OpCode.PACK:
                                case ThinNeo.OpCode.UNPACK:
                                case ThinNeo.OpCode.PICKITEM:
                                case ThinNeo.OpCode.SETITEM:
                                case ThinNeo.OpCode.NEWARRAY:
                                case ThinNeo.OpCode.NEWSTRUCT:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                case ThinNeo.OpCode.THROW:
                                case ThinNeo.OpCode.THROWIFNOT:
                                    o.paramType = Compiler.ParamType.None;
                                    break;
                                default:
                                    throw new Error("you fogot a type:" + o.code);
                            }
                        }
                    }
                    catch (_a) {
                        o.error = true;
                    }
                    arr.push(o);
                    if (o.error)
                        break;
                }
                return arr;
            };
            return Avm2Asm;
        }());
        Compiler.Avm2Asm = Avm2Asm;
    })(Compiler = ThinNeo.Compiler || (ThinNeo.Compiler = {}));
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var Compiler;
    (function (Compiler) {
        var ByteReader = (function () {
            function ByteReader(data) {
                this.addr = 0;
                this.data = data;
            }
            ByteReader.prototype.ReadOP = function () {
                var op = this.data[this.addr];
                this.addr++;
                return op;
            };
            ByteReader.prototype.ReadBytes = function (count) {
                var _data = new Uint8Array(count);
                for (var i = 0; i < count; i++)
                    _data[i] = this.data[this.addr + i];
                this.addr += count;
                return _data;
            };
            ByteReader.prototype.ReadByte = function () {
                var b = this.data[this.addr];
                this.addr++;
                return b;
            };
            ByteReader.prototype.ReadUInt16 = function () {
                var d = new DataView(this.data.buffer);
                var u16 = d.getUint16(this.addr, true);
                this.addr += 2;
                return u16;
            };
            ByteReader.prototype.ReadInt16 = function () {
                var d = new DataView(this.data.buffer);
                var u16 = d.getInt16(this.addr, true);
                this.addr += 2;
                return u16;
            };
            ByteReader.prototype.ReadUInt32 = function () {
                var d = new DataView(this.data.buffer);
                var u16 = d.getUint32(this.addr, true);
                this.addr += 4;
                return u16;
            };
            ByteReader.prototype.ReadInt32 = function () {
                var d = new DataView(this.data.buffer);
                var u16 = d.getInt32(this.addr, true);
                this.addr += 4;
                return u16;
            };
            ByteReader.prototype.ReadUInt64 = function () {
                var u1 = this.ReadUInt32();
                var u2 = this.ReadUInt32();
                return u2 * 0x100000000 + u1;
            };
            ByteReader.prototype.ReadVarBytes = function () {
                var count = this.ReadVarInt();
                return this.ReadBytes(count);
            };
            ByteReader.prototype.ReadVarInt = function () {
                var fb = this.ReadByte();
                var value;
                if (fb == 0xFD)
                    value = this.ReadUInt16();
                else if (fb == 0xFE)
                    value = this.ReadUInt32();
                else if (fb == 0xFF)
                    value = this.ReadUInt64();
                else
                    value = fb;
                return value;
            };
            Object.defineProperty(ByteReader.prototype, "End", {
                get: function () {
                    return this.addr >= this.data.length;
                },
                enumerable: true,
                configurable: true
            });
            return ByteReader;
        }());
        Compiler.ByteReader = ByteReader;
    })(Compiler = ThinNeo.Compiler || (ThinNeo.Compiler = {}));
})(ThinNeo || (ThinNeo = {}));
var ThinNeo;
(function (ThinNeo) {
    var Compiler;
    (function (Compiler) {
        var ParamType;
        (function (ParamType) {
            ParamType[ParamType["None"] = 0] = "None";
            ParamType[ParamType["ByteArray"] = 1] = "ByteArray";
            ParamType[ParamType["String"] = 2] = "String";
            ParamType[ParamType["Addr"] = 3] = "Addr";
        })(ParamType = Compiler.ParamType || (Compiler.ParamType = {}));
        var Op = (function () {
            function Op() {
            }
            Op.prototype.toString = function () {
                var name = this.getCodeName();
                if (this.paramType == ParamType.None) {
                }
                else if (this.paramType == ParamType.ByteArray) {
                    name += "[" + this.AsHexString() + "]";
                }
                else if (this.paramType == ParamType.String) {
                    name += "[" + this.AsString() + "]";
                }
                else if (this.paramType == ParamType.Addr) {
                    name += "[" + this.AsAddr() + "]";
                }
                return this.addr.toString(16) + ":" + name;
            };
            Op.prototype.AsHexString = function () {
                var str = "0x";
                for (var i = 0; i < this.paramData.length; i++) {
                    var s = this.paramData[i].toString(16);
                    if (s.length % 2 == 1)
                        s = "0" + s;
                    str += s;
                }
                return str;
            };
            Op.prototype.AsString = function () {
                var str = "";
                for (var i = 0; i < this.paramData.length; i++) {
                    str += this.paramData[i].toLocaleString();
                }
                return str;
            };
            Op.prototype.AsAddr = function () {
                var dview = new DataView(this.paramData.buffer);
                return dview.getInt16(0, true);
            };
            Op.prototype.getCodeName = function () {
                var name = "";
                if (this.error)
                    name = "[E]";
                if (this.code == ThinNeo.OpCode.PUSHT)
                    return "PUSH1(true)";
                if (this.code == ThinNeo.OpCode.PUSHF)
                    return "PUSH0(false)";
                if (this.code > ThinNeo.OpCode.PUSHBYTES1 && this.code < ThinNeo.OpCode.PUSHBYTES75)
                    return name + "PUSHBYTES" + (this.code - ThinNeo.OpCode.PUSHBYTES1 + 1);
                else
                    return name + ThinNeo.OpCode[this.code].toString();
            };
            return Op;
        }());
        Compiler.Op = Op;
    })(Compiler = ThinNeo.Compiler || (ThinNeo.Compiler = {}));
})(ThinNeo || (ThinNeo = {}));
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var Caching;
        (function (Caching) {
            var TrackableCollection = (function () {
                function TrackableCollection(items) {
                    this._map = new NeoMap();
                    if (items != null) {
                        for (var i = 0; i < items.length; i++) {
                            this._map.set(items[i].key, items[i]);
                            items[i].trackState = Caching.TrackState.None;
                        }
                    }
                }
                TrackableCollection.prototype.add = function (item) {
                    this._map.set(item.key, item);
                    item.trackState = Caching.TrackState.Added;
                };
                TrackableCollection.prototype.clear = function () {
                    this._map.forEach(function (value, key, map) {
                        if (value.trackState == Caching.TrackState.Added)
                            map.delete(key);
                        else
                            value.trackState = Caching.TrackState.Deleted;
                    });
                };
                TrackableCollection.prototype.commit = function () {
                    this._map.forEach(function (value, key, map) {
                        if (value.trackState == Caching.TrackState.Deleted)
                            map.delete(key);
                        else
                            value.trackState = Caching.TrackState.None;
                    });
                };
                TrackableCollection.prototype.forEach = function (callback) {
                    var _this = this;
                    this._map.forEach(function (value, key) {
                        callback(value, key, _this);
                    });
                };
                TrackableCollection.prototype.get = function (key) {
                    return this._map.get(key);
                };
                TrackableCollection.prototype.getChangeSet = function () {
                    var array = new Array();
                    this._map.forEach(function (value) {
                        if (value.trackState != Caching.TrackState.None)
                            array.push(value);
                    });
                    return array;
                };
                TrackableCollection.prototype.has = function (key) {
                    return this._map.has(key);
                };
                TrackableCollection.prototype.remove = function (key) {
                    var item = this._map.get(key);
                    if (item.trackState == Caching.TrackState.Added)
                        this._map.delete(key);
                    else
                        item.trackState = Caching.TrackState.Deleted;
                };
                return TrackableCollection;
            }());
            Caching.TrackableCollection = TrackableCollection;
        })(Caching = IO.Caching || (IO.Caching = {}));
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
var Neo;
(function (Neo) {
    var IO;
    (function (IO) {
        var Caching;
        (function (Caching) {
            var TrackState;
            (function (TrackState) {
                TrackState[TrackState["None"] = 0] = "None";
                TrackState[TrackState["Added"] = 1] = "Added";
                TrackState[TrackState["Changed"] = 2] = "Changed";
                TrackState[TrackState["Deleted"] = 3] = "Deleted";
            })(TrackState = Caching.TrackState || (Caching.TrackState = {}));
        })(Caching = IO.Caching || (IO.Caching = {}));
    })(IO = Neo.IO || (Neo.IO = {}));
})(Neo || (Neo = {}));
//# sourceMappingURL=neo-ts.js.map/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
/**
 * A noop padding strategy.
 */
CryptoJS.pad.NoPadding = {
    pad: function () {
    },

    unpad: function () {
    }
};
/*
CryptoJS v3.1.2
code.google.com/p/crypto-js
(c) 2009-2013 by Jeff Mott. All rights reserved.
code.google.com/p/crypto-js/wiki/License
*/
/**
 * Zero padding strategy.
 */
CryptoJS.pad.ZeroPadding = {
    pad: function (data, blockSize) {
        // Shortcut
        var blockSizeBytes = blockSize * 4;

        // Pad
        data.clamp();
        data.sigBytes += blockSizeBytes - ((data.sigBytes % blockSizeBytes) || blockSizeBytes);
    },

    unpad: function (data) {
        // Shortcut
        var dataWords = data.words;

        // Unpad
        var i = data.sigBytes - 1;
        while (!((dataWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff)) {
            i--;
        }
        data.sigBytes = i + 1;
    }
};
﻿/*!
 * Fast "async" scrypt implementation in JavaScript.
 * Copyright (c) 2013-2016 Dmitry Chestnykh | BSD License
 * https://github.com/dchest/scrypt-async-js
 */

/**
 * scrypt(password, salt, options, callback)
 *
 * where
 *
 * password and salt are strings or arrays of bytes (Array of Uint8Array)
 * options is
 *
 * {
 *    N:      // CPU/memory cost parameter, must be power of two
 *            // (alternatively, you can specify logN)
 *    r:      // block size
 *    p:      // parallelization parameter
 *    dkLen:  // length of derived key, default = 32
 *    encoding: // optional encoding:
 *                    "base64" - standard Base64 encoding
 *                    "hex" — hex encoding,
 *                    "binary" — Uint8Array,
 *                    undefined/null - Array of bytes
 *    interruptStep: // optional, steps to split calculations (default is 0)
 * }
 *
 * Derives a key from password and salt and calls callback
 * with derived key as the only argument.
 *
 * Calculations are interrupted with setImmediate (or zero setTimeout) at the
 * given interruptSteps to avoid freezing the browser. If it's undefined or zero,
 * the callback is called immediately after the calculation, avoiding setImmediate.
 *
 * Legacy way (only supports p = 1) to call this function is:
 *
 * scrypt(password, salt, logN, r, dkLen, [interruptStep], callback, [encoding])
 *
 * In legacy API, if interruptStep is not given, it defaults to 1000.
 * Pass 0 to have callback called immediately.
 *
 */
function scrypt(password, salt, logN, r, dkLen, interruptStep, callback, encoding)
{
    'use strict';

    function SHA256(m)
    {
    /** @const */ var K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
            0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
            0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
            0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
            0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
            0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
            0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
            0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
            0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
            0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
            0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
            h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19,
            w = new Array(64);

        function blocks(p)
        {
            var off = 0, len = p.length;
            while (len >= 64)
            {
                var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7,
                    u, i, j, t1, t2;

                for (i = 0; i < 16; i++)
                {
                    j = off + i * 4;
                    w[i] = ((p[j] & 0xff) << 24) | ((p[j + 1] & 0xff) << 16) |
                        ((p[j + 2] & 0xff) << 8) | (p[j + 3] & 0xff);
                }

                for (i = 16; i < 64; i++)
                {
                    u = w[i - 2];
                    t1 = ((u >>> 17) | (u << (32 - 17))) ^ ((u >>> 19) | (u << (32 - 19))) ^ (u >>> 10);

                    u = w[i - 15];
                    t2 = ((u >>> 7) | (u << (32 - 7))) ^ ((u >>> 18) | (u << (32 - 18))) ^ (u >>> 3);

                    w[i] = (((t1 + w[i - 7]) | 0) + ((t2 + w[i - 16]) | 0)) | 0;
                }

                for (i = 0; i < 64; i++)
                {
                    t1 = ((((((e >>> 6) | (e << (32 - 6))) ^ ((e >>> 11) | (e << (32 - 11))) ^
                        ((e >>> 25) | (e << (32 - 25)))) + ((e & f) ^ (~e & g))) | 0) +
                        ((h + ((K[i] + w[i]) | 0)) | 0)) | 0;

                    t2 = ((((a >>> 2) | (a << (32 - 2))) ^ ((a >>> 13) | (a << (32 - 13))) ^
                        ((a >>> 22) | (a << (32 - 22)))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;

                    h = g;
                    g = f;
                    f = e;
                    e = (d + t1) | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = (t1 + t2) | 0;
                }

                h0 = (h0 + a) | 0;
                h1 = (h1 + b) | 0;
                h2 = (h2 + c) | 0;
                h3 = (h3 + d) | 0;
                h4 = (h4 + e) | 0;
                h5 = (h5 + f) | 0;
                h6 = (h6 + g) | 0;
                h7 = (h7 + h) | 0;

                off += 64;
                len -= 64;
            }
        }

        blocks(m);

        var i, bytesLeft = m.length % 64,
            bitLenHi = (m.length / 0x20000000) | 0,
            bitLenLo = m.length << 3,
            numZeros = (bytesLeft < 56) ? 56 : 120,
            p = m.slice(m.length - bytesLeft, m.length);

        p.push(0x80);
        for (i = bytesLeft + 1; i < numZeros; i++) p.push(0);
        p.push((bitLenHi >>> 24) & 0xff);
        p.push((bitLenHi >>> 16) & 0xff);
        p.push((bitLenHi >>> 8) & 0xff);
        p.push((bitLenHi >>> 0) & 0xff);
        p.push((bitLenLo >>> 24) & 0xff);
        p.push((bitLenLo >>> 16) & 0xff);
        p.push((bitLenLo >>> 8) & 0xff);
        p.push((bitLenLo >>> 0) & 0xff);

        blocks(p);

        return [
            (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, (h0 >>> 0) & 0xff,
            (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, (h1 >>> 0) & 0xff,
            (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, (h2 >>> 0) & 0xff,
            (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, (h3 >>> 0) & 0xff,
            (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, (h4 >>> 0) & 0xff,
            (h5 >>> 24) & 0xff, (h5 >>> 16) & 0xff, (h5 >>> 8) & 0xff, (h5 >>> 0) & 0xff,
            (h6 >>> 24) & 0xff, (h6 >>> 16) & 0xff, (h6 >>> 8) & 0xff, (h6 >>> 0) & 0xff,
            (h7 >>> 24) & 0xff, (h7 >>> 16) & 0xff, (h7 >>> 8) & 0xff, (h7 >>> 0) & 0xff
        ];
    }

    function PBKDF2_HMAC_SHA256_OneIter(password, salt, dkLen)
    {
        // compress password if it's longer than hash block length
        password = password.length <= 64 ? password : SHA256(password);

        var i, innerLen = 64 + salt.length + 4,
            inner = new Array(innerLen),
            outerKey = new Array(64),
            dk = [];

        // inner = (password ^ ipad) || salt || counter
        for (i = 0; i < 64; i++) inner[i] = 0x36;
        for (i = 0; i < password.length; i++) inner[i] ^= password[i];
        for (i = 0; i < salt.length; i++) inner[64 + i] = salt[i];
        for (i = innerLen - 4; i < innerLen; i++) inner[i] = 0;

        // outerKey = password ^ opad
        for (i = 0; i < 64; i++) outerKey[i] = 0x5c;
        for (i = 0; i < password.length; i++) outerKey[i] ^= password[i];

        // increments counter inside inner
        function incrementCounter()
        {
            for (var i = innerLen - 1; i >= innerLen - 4; i--)
            {
                inner[i]++;
                if (inner[i] <= 0xff) return;
                inner[i] = 0;
            }
        }

        // output blocks = SHA256(outerKey || SHA256(inner)) ...
        while (dkLen >= 32)
        {
            incrementCounter();
            dk = dk.concat(SHA256(outerKey.concat(SHA256(inner))));
            dkLen -= 32;
        }
        if (dkLen > 0)
        {
            incrementCounter();
            dk = dk.concat(SHA256(outerKey.concat(SHA256(inner))).slice(0, dkLen));
        }
        return dk;
    }

    function salsaXOR(tmp, B, bin, bout)
    {
        var j0 = tmp[0] ^ B[bin++],
            j1 = tmp[1] ^ B[bin++],
            j2 = tmp[2] ^ B[bin++],
            j3 = tmp[3] ^ B[bin++],
            j4 = tmp[4] ^ B[bin++],
            j5 = tmp[5] ^ B[bin++],
            j6 = tmp[6] ^ B[bin++],
            j7 = tmp[7] ^ B[bin++],
            j8 = tmp[8] ^ B[bin++],
            j9 = tmp[9] ^ B[bin++],
            j10 = tmp[10] ^ B[bin++],
            j11 = tmp[11] ^ B[bin++],
            j12 = tmp[12] ^ B[bin++],
            j13 = tmp[13] ^ B[bin++],
            j14 = tmp[14] ^ B[bin++],
            j15 = tmp[15] ^ B[bin++],
            u, i;

        var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7,
            x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14,
            x15 = j15;

        for (i = 0; i < 8; i += 2)
        {
            u = x0 + x12; x4 ^= u << 7 | u >>> (32 - 7);
            u = x4 + x0; x8 ^= u << 9 | u >>> (32 - 9);
            u = x8 + x4; x12 ^= u << 13 | u >>> (32 - 13);
            u = x12 + x8; x0 ^= u << 18 | u >>> (32 - 18);

            u = x5 + x1; x9 ^= u << 7 | u >>> (32 - 7);
            u = x9 + x5; x13 ^= u << 9 | u >>> (32 - 9);
            u = x13 + x9; x1 ^= u << 13 | u >>> (32 - 13);
            u = x1 + x13; x5 ^= u << 18 | u >>> (32 - 18);

            u = x10 + x6; x14 ^= u << 7 | u >>> (32 - 7);
            u = x14 + x10; x2 ^= u << 9 | u >>> (32 - 9);
            u = x2 + x14; x6 ^= u << 13 | u >>> (32 - 13);
            u = x6 + x2; x10 ^= u << 18 | u >>> (32 - 18);

            u = x15 + x11; x3 ^= u << 7 | u >>> (32 - 7);
            u = x3 + x15; x7 ^= u << 9 | u >>> (32 - 9);
            u = x7 + x3; x11 ^= u << 13 | u >>> (32 - 13);
            u = x11 + x7; x15 ^= u << 18 | u >>> (32 - 18);

            u = x0 + x3; x1 ^= u << 7 | u >>> (32 - 7);
            u = x1 + x0; x2 ^= u << 9 | u >>> (32 - 9);
            u = x2 + x1; x3 ^= u << 13 | u >>> (32 - 13);
            u = x3 + x2; x0 ^= u << 18 | u >>> (32 - 18);

            u = x5 + x4; x6 ^= u << 7 | u >>> (32 - 7);
            u = x6 + x5; x7 ^= u << 9 | u >>> (32 - 9);
            u = x7 + x6; x4 ^= u << 13 | u >>> (32 - 13);
            u = x4 + x7; x5 ^= u << 18 | u >>> (32 - 18);

            u = x10 + x9; x11 ^= u << 7 | u >>> (32 - 7);
            u = x11 + x10; x8 ^= u << 9 | u >>> (32 - 9);
            u = x8 + x11; x9 ^= u << 13 | u >>> (32 - 13);
            u = x9 + x8; x10 ^= u << 18 | u >>> (32 - 18);

            u = x15 + x14; x12 ^= u << 7 | u >>> (32 - 7);
            u = x12 + x15; x13 ^= u << 9 | u >>> (32 - 9);
            u = x13 + x12; x14 ^= u << 13 | u >>> (32 - 13);
            u = x14 + x13; x15 ^= u << 18 | u >>> (32 - 18);
        }

        B[bout++] = tmp[0] = (x0 + j0) | 0;
        B[bout++] = tmp[1] = (x1 + j1) | 0;
        B[bout++] = tmp[2] = (x2 + j2) | 0;
        B[bout++] = tmp[3] = (x3 + j3) | 0;
        B[bout++] = tmp[4] = (x4 + j4) | 0;
        B[bout++] = tmp[5] = (x5 + j5) | 0;
        B[bout++] = tmp[6] = (x6 + j6) | 0;
        B[bout++] = tmp[7] = (x7 + j7) | 0;
        B[bout++] = tmp[8] = (x8 + j8) | 0;
        B[bout++] = tmp[9] = (x9 + j9) | 0;
        B[bout++] = tmp[10] = (x10 + j10) | 0;
        B[bout++] = tmp[11] = (x11 + j11) | 0;
        B[bout++] = tmp[12] = (x12 + j12) | 0;
        B[bout++] = tmp[13] = (x13 + j13) | 0;
        B[bout++] = tmp[14] = (x14 + j14) | 0;
        B[bout++] = tmp[15] = (x15 + j15) | 0;
    }

    function blockCopy(dst, di, src, si, len)
    {
        while (len--) dst[di++] = src[si++];
    }

    function blockXOR(dst, di, src, si, len)
    {
        while (len--) dst[di++] ^= src[si++];
    }

    function blockMix(tmp, B, bin, bout, r)
    {
        blockCopy(tmp, 0, B, bin + (2 * r - 1) * 16, 16);
        for (var i = 0; i < 2 * r; i += 2)
        {
            salsaXOR(tmp, B, bin + i * 16, bout + i * 8);
            salsaXOR(tmp, B, bin + i * 16 + 16, bout + i * 8 + r * 16);
        }
    }

    function integerify(B, bi, r)
    {
        return B[bi + (2 * r - 1) * 16];
    }

    function stringToUTF8Bytes(s)
    {
        var arr = [];
        for (var i = 0; i < s.length; i++)
        {
            var c = s.charCodeAt(i);
            if (c < 0x80)
            {
                arr.push(c);
            } else if (c < 0x800)
            {
                arr.push(0xc0 | c >> 6);
                arr.push(0x80 | c & 0x3f);
            } else if (c < 0xd800)
            {
                arr.push(0xe0 | c >> 12);
                arr.push(0x80 | (c >> 6) & 0x3f);
                arr.push(0x80 | c & 0x3f);
            } else
            {
                if (i >= s.length - 1)
                {
                    throw new Error('invalid string');
                }
                i++; // get one more character
                c = (c & 0x3ff) << 10;
                c |= s.charCodeAt(i) & 0x3ff;
                c += 0x10000;

                arr.push(0xf0 | c >> 18);
                arr.push(0x80 | (c >> 12) & 0x3f);
                arr.push(0x80 | (c >> 6) & 0x3f);
                arr.push(0x80 | c & 0x3f);
            }
        }
        return arr;
    }

    function bytesToHex(p)
    {
        /** @const */
        var enc = '0123456789abcdef'.split('');

        var len = p.length,
            arr = [],
            i = 0;

        for (; i < len; i++)
        {
            arr.push(enc[(p[i] >>> 4) & 15]);
            arr.push(enc[(p[i] >>> 0) & 15]);
        }
        return arr.join('');
    }

    function bytesToBase64(p)
    {
        /** @const */
        var enc = ('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
            '0123456789+/').split('');

        var len = p.length,
            arr = [],
            i = 0,
            a, b, c, t;

        while (i < len)
        {
            a = i < len ? p[i++] : 0;
            b = i < len ? p[i++] : 0;
            c = i < len ? p[i++] : 0;
            t = (a << 16) + (b << 8) + c;
            arr.push(enc[(t >>> 3 * 6) & 63]);
            arr.push(enc[(t >>> 2 * 6) & 63]);
            arr.push(enc[(t >>> 1 * 6) & 63]);
            arr.push(enc[(t >>> 0 * 6) & 63]);
        }
        if (len % 3 > 0)
        {
            arr[arr.length - 1] = '=';
            if (len % 3 === 1) arr[arr.length - 2] = '=';
        }
        return arr.join('');
    }


    // Generate key.

    var MAX_UINT = (-1) >>> 0,
        p = 1;

    if (typeof logN === "object")
    {
        // Called as: scrypt(password, salt, opts, callback)
        if (arguments.length > 4)
        {
            throw new Error('scrypt: incorrect number of arguments');
        }

        var opts = logN;

        callback = r;
        logN = opts.logN;
        if (typeof logN === 'undefined')
        {
            if (typeof opts.N !== 'undefined')
            {
                if (opts.N < 2 || opts.N > MAX_UINT)
                    throw new Error('scrypt: N is out of range');

                if ((opts.N & (opts.N - 1)) !== 0)
                    throw new Error('scrypt: N is not a power of 2');

                logN = Math.log(opts.N) / Math.LN2;
            } else
            {
                throw new Error('scrypt: missing N parameter');
            }
        }
        p = opts.p || 1;
        r = opts.r;
        dkLen = opts.dkLen || 32;
        interruptStep = opts.interruptStep || 0;
        encoding = opts.encoding;
    }

    if (p < 1)
        throw new Error('scrypt: invalid p');

    if (r <= 0)
        throw new Error('scrypt: invalid r');

    if (logN < 1 || logN > 31)
        throw new Error('scrypt: logN must be between 1 and 31');


    var N = (1 << logN) >>> 0,
        XY, V, B, tmp;

    if (r * p >= 1 << 30 || r > MAX_UINT / 128 / p || r > MAX_UINT / 256 || N > MAX_UINT / 128 / r)
        throw new Error('scrypt: parameters are too large');

    // Decode strings.
    if (typeof password === 'string')
        password = stringToUTF8Bytes(password);
    if (typeof salt === 'string')
        salt = stringToUTF8Bytes(salt);

    if (typeof Int32Array !== 'undefined')
    {
        //XXX We can use Uint32Array, but Int32Array is faster in Safari.
        XY = new Int32Array(64 * r);
        V = new Int32Array(32 * N * r);
        tmp = new Int32Array(16);
    } else
    {
        XY = [];
        V = [];
        tmp = new Array(16);
    }
    B = PBKDF2_HMAC_SHA256_OneIter(password, salt, p * 128 * r);

    var xi = 0, yi = 32 * r;

    function smixStart(pos)
    {
        for (var i = 0; i < 32 * r; i++)
        {
            var j = pos + i * 4;
            XY[xi + i] = ((B[j + 3] & 0xff) << 24) | ((B[j + 2] & 0xff) << 16) |
                ((B[j + 1] & 0xff) << 8) | ((B[j + 0] & 0xff) << 0);
        }
    }

    function smixStep1(start, end)
    {
        for (var i = start; i < end; i += 2)
        {
            blockCopy(V, i * (32 * r), XY, xi, 32 * r);
            blockMix(tmp, XY, xi, yi, r);

            blockCopy(V, (i + 1) * (32 * r), XY, yi, 32 * r);
            blockMix(tmp, XY, yi, xi, r);
        }
    }

    function smixStep2(start, end)
    {
        for (var i = start; i < end; i += 2)
        {
            var j = integerify(XY, xi, r) & (N - 1);
            blockXOR(XY, xi, V, j * (32 * r), 32 * r);
            blockMix(tmp, XY, xi, yi, r);

            j = integerify(XY, yi, r) & (N - 1);
            blockXOR(XY, yi, V, j * (32 * r), 32 * r);
            blockMix(tmp, XY, yi, xi, r);
        }
    }

    function smixFinish(pos)
    {
        for (var i = 0; i < 32 * r; i++)
        {
            var j = XY[xi + i];
            B[pos + i * 4 + 0] = (j >>> 0) & 0xff;
            B[pos + i * 4 + 1] = (j >>> 8) & 0xff;
            B[pos + i * 4 + 2] = (j >>> 16) & 0xff;
            B[pos + i * 4 + 3] = (j >>> 24) & 0xff;
        }
    }

    var nextTick = (typeof setImmediate !== 'undefined') ? setImmediate : setTimeout;

    function interruptedFor(start, end, step, fn, donefn)
    {
        (function performStep()
        {
            nextTick(function ()
            {
                fn(start, start + step < end ? start + step : end);
                start += step;
                if (start < end)
                    performStep();
                else
                    donefn();
            });
        })();
    }

    function getResult(enc)
    {
        var result = PBKDF2_HMAC_SHA256_OneIter(password, B, dkLen);
        if (enc === 'base64')
            return bytesToBase64(result);
        else if (enc === 'hex')
            return bytesToHex(result);
        else if (enc === 'binary')
            return new Uint8Array(result);
        else
            return result;
    }

    // Blocking variant.
    function calculateSync()
    {
        for (var i = 0; i < p; i++)
        {
            smixStart(i * 128 * r);
            smixStep1(0, N);
            smixStep2(0, N);
            smixFinish(i * 128 * r);
        }
        callback(getResult(encoding));
    }

    // Async variant.
    function calculateAsync(i)
    {
        smixStart(i * 128 * r);
        interruptedFor(0, N, interruptStep * 2, smixStep1, function ()
        {
            interruptedFor(0, N, interruptStep * 2, smixStep2, function ()
            {
                smixFinish(i * 128 * r);
                if (i + 1 < p)
                {
                    nextTick(function () { calculateAsync(i + 1); });
                } else
                {
                    callback(getResult(encoding));
                }
            });
        });
    }

    if (typeof interruptStep === 'function')
    {
        // Called as: scrypt(...,      callback, [encoding])
        //  shifting: scrypt(..., interruptStep,  callback, [encoding])
        encoding = callback;
        callback = interruptStep;
        interruptStep = 1000;
    }

    if (interruptStep <= 0)
    {
        calculateSync();
    } else
    {
        calculateAsync(0);
    }
}

if (typeof module !== 'undefined') module.exports = scrypt;!function(){var r;!function(r){function n(r){return f?new f(r):new Array(r)}function o(r){return f?new f(r):r}function t(r){for(var o=r.length/2,t=n(o),e=0;e<o;e++){var a=parseInt(r.substr(2*e,2),16);if(isNaN(a))throw Error("invalid hex data");t[e]=a}return t}function e(r){for(var n=r.length,o="",t=0;t<n;t++){var e=255&r[t],a=e.toString(16);e<16&&(a="0"+a),o+=a}return o}function a(r){var n=window.TextEncoder;if(n)return(new n).encode(r);for(var t=[],e=0,a=0,i=encodeURI(r),c=i.length;e<c;){var f=i.charCodeAt(e);if(37==f){var s=i.substr(e+1,2);f=parseInt(s,16),e+=3}else e++;t[a++]=f}return o(t)}function i(r){for(var n=r.length,o="",t=0;t<n;t++){var e=r[t],a=e.toString(16);e<16&&(a="0"+a),o+="%"+a}return decodeURIComponent(o)}function c(r){r.style.cssText="position:absolute;top:-999px"}var f=window.Uint8Array;r.hexToBytes=t,r.bytesToHex=e,r.strToBytes=a,r.bytesToStr=i,r.hideDom=c}(r||(r={}));var n;!function(r){function n(){return"Worker"in window}function o(n){t.__asmjs_cb=s;var o=n+"asmjs.js",e=document.createElement("script");e.onerror=function(){r.onerror("script load fail")},e.src=o,document.body.appendChild(e)}function e(r,n,o){u.hash(r,n,o)}function a(r,n,o,t,e,a,i){u.config.apply(this,arguments)}function i(){u.stop()}function c(){u.free()}function f(){u&&(u.unload(),u=null)}function s(n,o){"onload"==n&&(u=o),r[n](o)}var u;r.check=n,r.load=o,r.hash=e,r.config=a,r.stop=i,r.free=c,r.unload=f}(n||(n={}));var o;!function(n){function o(){return v()>=18}function e(n){t.__flash_cb=u;var o=n+"flash.swf";m=l(o),r.hideDom(m)}function a(n,o,t){var e=r.bytesToHex(n),a=r.bytesToHex(o);m.hash(e,a,t)}function i(r,n,o,t,e,a,i){m.config.apply(m,arguments)}function c(){m.cancel()}function f(){m.free(),m=null}function s(){document.body.removeChild(m),m=null}function u(o,t){"oncomplete"==o&&(t=r.hexToBytes(t));try{n[o](t)}catch(e){throw e}}function l(r){var n=document.createElement("div"),o="_"+(1e6*Math.random()|0);r=encodeURI(r),n.innerHTML=p?"<object id="+o+" classid=clsid:D27CDB6E-AE6D-11cf-96B8-444553540000><param name=movie value="+r+"><param name=allowScriptAccess value=always></object>":"<embed id="+o+" name="+o+" src="+r+" type=application/x-shockwave-flash allowScriptAccess=always></embed>";var t=n.firstChild;return document.body.appendChild(t),t}function h(){var r=navigator.plugins;if(r){var n=r["Shockwave Flash"];if(n){var o=n.description;if(o)return+o.match(w)}}}function d(){var r=window.ActiveXObject;if(r){var n="";try{n=new r("ShockwaveFlash.ShockwaveFlash").GetVariable("$version").replace(",",".")}catch(o){return}return+n.match(w)}}function v(){var r=h();return r>0?r:(r=d(),r>0?(p=!0,r):0)}var m,p;n.check=o,n.load=e,n.hash=a,n.config=i,n.stop=c,n.free=f,n.unload=s;var w=/\d+\.\d+/}(o||(o={}));var t;!function(t){function e(){for(var r=f(),n={},o=0;o<r.length;o++)n[r[o]]=!0;var t=navigator.userAgent;return/Chrome|Firefox|Edge|Safari/.test(t)&&"asmjs"in n?"asmjs":"flash"in n?"flash":null}function a(r,n){if(r)switch(arguments.length){case 1:return r();case 2:return r(n)}}function i(){k&&(clearTimeout(k),k=0)}function c(r,n,o){if(T<2)throw Error("scrypt not loaded");if(T<4)throw Error("scrypt not configed");if(5==T)throw Error("scrypt is running");if(T=5,o=o||B,r=r||[],n=n||[],r.length>j)throw Error("pass.length > maxPassLen");if(n.length>A)throw Error("salt.length > maxSaltLen");if(o>B)throw Error("dkLen > maxDkLen");x.hash(r,n,o)}function f(){if(!E){E=[];for(var r in b)b[r].check()&&E.push(r)}return E}function s(r){if(!(T>=1)){if(!r&&(r=e(),!r))throw Error("no available mod");if(x=b[r],!x)throw Error("unsupported mod: "+r);x.onload=function(){i(),a(t.onload)},x.onerror=function(r){h(),a(t.onerror,r)},x.onready=function(){T=4,a(t.onready)},x.onprogress=function(r){a(t.onprogress,r)},x.oncomplete=function(r){T=4,a(t.onprogress,1),a(t.oncomplete,r)},i(),k=setTimeout(function(){h(),a(t.onerror,"load timeout")},L),T=1,x.load(S)}}function u(){x.stop(),T=4}function l(){4==T&&(x.free(),T=2)}function h(){0!=T&&(x.unload(),T=0),i()}function d(r,n,o){if(!r)throw Error("config() takes at least 1 argument");var t=0|r.N;if(!(1<t&&t<=8388608))throw Error("param N out of range (1 < N <= 2^23)");if(t&t-1)throw Error("param N must be power of 2");var e=0|r.r;if(!(0<e&&e<256))throw Error("param r out of range (0 < r < 256)");var a=0|r.P;if(!(0<a&&a<256))throw Error("param P out of range (0 < P < 256)");var i=t*e*128;if(i>1073741824)throw Error("memory limit exceeded (N * r * 128 > 1G)");if(n){var c=n.maxPassLen;if(null==c)c=j;else if(c<=0)throw Error("invalid maxPassLen");var f=n.maxSaltLen;if(null==f)f=A;else if(f<=0)throw Error("invalid maxSaltLen");var s=n.maxDkLen;if(null==s)s=B;else if(s<=0)throw Error("invalid maxDkLen");var u=n.maxThread;if(null==u)u=C;else if(u<=0)throw Error("invalid maxThread");o||(j=0|c,A=0|f,B=0|s,C=0|u)}if(!o){var l=Math.ceil(a/C),h=Math.ceil(a/l);x.config(t,e,a,h,j,A,B),T=3}}function v(n){return r.strToBytes(n)}function m(n){return r.bytesToStr(n)}function p(n){if(n.length%2)throw Error("invalid hex length");return r.hexToBytes(n)}function w(n){return r.bytesToHex(n)}function g(r){/\/$/.test(r)||(r+="/"),S=r}function y(r){L=r}var x,E,b={asmjs:n,flash:o},T=0,S="",k=0,L=3e4,j=64,A=64,B=64,C=1;t.hash=c,t.getAvailableMod=f,t.load=s,t.stop=u,t.free=l,t.unload=h,t.config=d,t.strToBin=v,t.binToStr=m,t.hexToBin=p,t.binToHex=w,t.setResPath=g,t.setResTimeout=y,window.scrypt=t}(t||(t={}))}();
//# sourceMappingURL=sourcemap/scrypt.js.map