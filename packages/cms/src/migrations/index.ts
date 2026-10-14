import * as migration_20260922_105340 from './20260922_105340';
import * as migration_20260924_090501 from './20260924_090501';
import * as migration_20260924_112402 from './20260924_112402';
import * as migration_20260924_114349 from './20260924_114349';
import * as migration_20260930_062326 from './20260930_062326';

export const migrations = [
  {
    up: migration_20260922_105340.up,
    down: migration_20260922_105340.down,
    name: '20260922_105340',
  },
  {
    up: migration_20260924_090501.up,
    down: migration_20260924_090501.down,
    name: '20260924_090501',
  },
  {
    up: migration_20260924_112402.up,
    down: migration_20260924_112402.down,
    name: '20260924_112402',
  },
  {
    up: migration_20260924_114349.up,
    down: migration_20260924_114349.down,
    name: '20260924_114349',
  },
  {
    up: migration_20260930_062326.up,
    down: migration_20260930_062326.down,
    name: '20260930_062326'
  },
];
