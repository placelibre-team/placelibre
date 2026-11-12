const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = vm.createContext({location:{search:''}, URLSearchParams, console});
vm.runInContext(fs.readFileSync('public/js/config.js','utf8') + '\n' + fs.readFileSync('public/js/model.js','utf8'), ctx);
assert.equal(vm.runInContext("ruleText('Rue Saint-Honorat', new Date('2026-11-12T10:00:00'))",ctx),'Tarif à confirmer');
assert.equal(vm.runInContext("BASE_SEGS.filter(s => s.name === 'Rue Saint-Honorat').every(s => s.type === 'unk')",ctx),true);
assert.equal(vm.runInContext("RULES['Rue Bricka'].paid",ctx),true);
console.log('OK : Saint-Honorat reste inconnu, Bricka conservé.');
