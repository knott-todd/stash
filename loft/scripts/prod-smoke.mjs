// Production smoke: real staged upload → register → download → compare → delete.
// Usage: node scripts/prod-smoke.mjs [https://stash.olusanyatodd.com]
import { upload } from "@vercel/blob/client";
const B = process.argv[2] ?? "https://stash.olusanyatodd.com";
const plain = new TextEncoder().encode("prod roundtrip " + new Date().toISOString());
const put = await upload("tmp/node-test.stash", new Blob([plain]), { access:"private", handleUploadUrl: B+"/api/blob", contentType:"application/octet-stream" });
const r = await fetch(B+"/api/files",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({blobUrl:put.url,name:"node-test.txt",mime:"text/plain",size:String(plain.length),folder:"",source:"upload",encrypted:"0"})});
const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
const j = await r.json();
if (!r.ok) throw new Error("files POST "+r.status+" "+JSON.stringify(j));
const back = await fetch(B+"/api/files/"+j.file.id+"/download",{headers:{cookie}}).then(x=>x.text());
console.log(JSON.stringify({stored:j.file.stored, name:j.file.name, size:j.file.size, roundtrip: back === new TextDecoder().decode(plain)}));
await fetch(B+"/api/files/"+j.file.id,{method:"DELETE",headers:{cookie}});
