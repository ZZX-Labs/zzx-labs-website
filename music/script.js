// /music/script.js — wrapper that boots the modular player
import { boot } from './modules/player.js';

const root = document.querySelector('[data-mp]');
if (root) boot(root);
