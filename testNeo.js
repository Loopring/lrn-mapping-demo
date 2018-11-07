// require("./public/lib/crypto.js");
// require("./public/lib/aes.js");
// require("./public/lib/mode-ecb.js");
// require("./public/lib/pad-nopadding.js");
// require("./public/lib/scrypt.js");
// require("./public/lib/neo-ts.js");

const fs = require("fs");

const fileContent = fs.readFileSync("./all.js", "utf8");
eval(fileContent);

const sign = ThinNeo.Helper.Sign("010203ff1122abcd", "94b3335830392a3586c2d7072cfe49efc3ef048876f526cbb7061b30a2278012");
const signHex = sign.toHexString();
console.log("signHex:", signHex);
