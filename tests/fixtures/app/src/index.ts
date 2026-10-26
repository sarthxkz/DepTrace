import { helper } from './utils';
import { api } from '@/services/api';
import type { Config } from './types';
import './polyfills';
import * as math from './math.js';
import leftPad from 'left-pad';
import { feature } from '@scope/pkg/feature';
import fs from 'node:fs';
import missing from './missing';
import gone from '@missing/thing';
import notInstalled from 'not-installed';
import data from './data.json';
import './styles.css';

export { helper };
export * from './math.js';
export type { Config };

export const lazy = () => import('./lazy');
const name = './lazy';
export const dynamic = () => import(name);

export const used = [api, math, leftPad, feature, fs, missing, gone, notInstalled, data];
