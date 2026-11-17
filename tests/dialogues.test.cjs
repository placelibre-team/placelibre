'use strict';
// Modèle DOM minimal : vérifie les événements/focus sans réseau ni dépendance navigateur.
// Le rendu CSS et l'annonce par un lecteur d'écran nécessitent un essai sur appareil.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const listeners = [], observers = [];
let document;
class Element {
  constructor(id, options = {}) {
    Object.assign(this, {id, hidden:false, inert:false, disabled:false, visible:true, tabIndex:0, children:[], parent:null, focusable:false}, options);
  }
  add(el) { el.parent = this; this.children.push(el); return el; }
  contains(el) { return el === this || this.children.some(child => child.contains(el)); }
  querySelectorAll() { return this.children.flatMap(child => [...(child.focusable ? [child] : []), ...child.querySelectorAll()]); }
  querySelector(selector) { return this.querySelectorAll().find(el => selector !== '[data-slot]' || el.slot) || null; }
  closest() { return this.hidden || this.inert ? this : this.parent ? this.parent.closest() : null; }
  getClientRects() { return this.visible && !this.closest() ? [{}] : []; }
  matches() { return !!this.selected && !!this.slot; }
  hasAttribute(name) { return name === 'data-slot' && !!this.slot; }
  focus() { if(this.visible && !this.closest() && !this.disabled) document.activeElement = this; }
  click() { if(this.onclick) this.onclick(); }
}
const body = new Element('body'), app = body.add(new Element('app'));
const open = app.add(new Element('open', {focusable:true}));
const confirm = body.add(new Element('confirmSlot', {hidden:true}));
const welcome = body.add(new Element('welcome', {hidden:true}));
const settings = body.add(new Element('settings', {hidden:true}));
const name = welcome.add(new Element('name', {focusable:true}));
const next = welcome.add(new Element('next', {focusable:true}));
const close = settings.add(new Element('btnCloseSet', {focusable:true}));
const invite = settings.add(new Element('btnInvite', {focusable:true, hidden:true}));
const newCanal = settings.add(new Element('btnNewCanal', {focusable:true}));
const hidden = settings.add(new Element('hidden', {focusable:true, visible:false}));
settings.add(new Element('disabled', {focusable:true, disabled:true}));
settings.add(new Element('programmatic', {focusable:true, tabIndex:-1}));
const all = () => [body, ...body.children.flatMap(el => [el, ...el.querySelectorAll()])];
document = {
  activeElement:body,
  getElementById:id => all().find(el => el.id === id), contains:el => body.contains(el),
  addEventListener:(type, callback, capture) => listeners.push({type, callback, capture})
};
let confirmOpen = false;
// events.js registers the confirmation Escape listener before dialogues.js.
document.addEventListener('keydown', e => { if(e.key === 'Escape' && confirmOpen) { confirm.hidden = true; confirmOpen = false; } });
close.onclick = () => { settings.hidden = true; };
const context = vm.createContext({document, console, requestAnimationFrame:fn => fn(),
  MutationObserver:class { constructor(callback) { observers.push(callback); } observe() {} },
  closeWelcome:() => { welcome.hidden = true; }
});
const flush = () => observers.forEach(callback => callback());
function key(value, shiftKey = false) {
  const e = {key:value, shiftKey, prevented:false, preventDefault() { this.prevented = true; }};
  listeners.filter(l => l.type === 'keydown').sort((a, b) => Number(!!b.capture) - Number(!!a.capture)).forEach(l => l.callback(e));
  flush(); return e;
}
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/dialogues.js'), 'utf8'), context);
open.focus(); welcome.hidden = false; flush();
assert.equal(document.activeElement, name); assert.equal(app.inert, true);
assert.equal(key('Tab', true).prevented, true); assert.equal(document.activeElement, next);
assert.equal(key('Tab').prevented, true); assert.equal(document.activeElement, name);
assert.equal(key('Tab').prevented, false); // ordinary traversal within the dialog stays native
key('Escape'); assert.equal(welcome.hidden, true); assert.equal(app.inert, false); assert.equal(document.activeElement, open);

settings.hidden = false; flush(); assert.equal(document.activeElement, close);
key('Tab', true); assert.equal(document.activeElement, newCanal); // hidden/disabled/-1 controls skipped
invite.hidden = false; flush(); invite.focus(); assert.equal(key('Tab').prevented, false);
newCanal.focus(); key('Tab'); assert.equal(document.activeElement, close);
key('Escape'); assert.equal(settings.hidden, true); assert.equal(document.activeElement, open);

const first = confirm.add(new Element('first', {focusable:true, slot:'a'}));
let selected = confirm.add(new Element('selected', {focusable:true, slot:'b', selected:true}));
let ok = confirm.add(new Element('ok', {focusable:true}));
confirm.hidden = false; confirmOpen = true; flush(); assert.equal(document.activeElement, selected);
// drawConfirm replaces every option node after choosing another place.
confirm.children = []; document.activeElement = body;
selected = confirm.add(new Element('replacement', {focusable:true, slot:'c', selected:true}));
ok = confirm.add(new Element('ok', {focusable:true}));
flush(); assert.equal(document.activeElement, selected);
ok.focus(); key('Tab'); assert.equal(document.activeElement, selected);
settings.hidden = false; flush(); assert.equal(settings.inert, true);
key('Escape'); assert.equal(confirm.hidden, true); assert.equal(settings.hidden, false); // one Escape closes one window
assert.equal(settings.inert, false); assert.equal(document.activeElement, close);
key('Escape'); assert.equal(app.inert, false); assert.equal(document.activeElement, open);

confirm.children = []; confirm.hidden = false; confirmOpen = true; flush();
assert.equal(document.activeElement, confirm); assert.equal(key('Tab').prevented, true);
key('Escape'); assert.equal(document.activeElement, open);
console.log('OK : focus choisi/restauré, boucle Tab/Shift+Tab, contrôles canal, éléments masqués et fermeture isolée.');
