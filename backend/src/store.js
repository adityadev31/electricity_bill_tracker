import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

/**
 * Store interface:
 *   repos.real / repos.test : { list(), add(bill), remove(month), clear() }   (bills are immutable once added)
 *   getSettings() / setSettings(patch)                         ({ mode, unlock })
 * Real and test data live in separate files / collections, so test mode never touches real bills.
 */

const duplicate = () => Object.assign(new Error('exists'), { code: 'DUPLICATE' });

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function fileRepo(name) {
  const file = path.join(DIR, `${name}.json`);
  let items;
  const load = async () => (items ??= await readJson(file, []));
  return {
    async list() {
      return [...(await load())].sort((a, b) => a.month.localeCompare(b.month));
    },
    async add(bill) {
      const all = await load();
      if (all.some((b) => b.month === bill.month)) throw duplicate();
      all.push(bill);
      await writeJson(file, all);
      return bill;
    },
    async remove(month) {
      const all = await load();
      items = all.filter((b) => b.month !== month);
      await writeJson(file, items);
    },
    async clear() {
      items = [];
      await writeJson(file, items);
    },
  };
}

function fileStore() {
  const settingsFile = path.join(DIR, 'settings.json');
  return {
    kind: 'file',
    repos: { real: fileRepo('bills'), test: fileRepo('bills.test') },
    getSettings: () => readJson(settingsFile, {}),
    async setSettings(patch) {
      const next = { ...(await readJson(settingsFile, {})), ...patch };
      await writeJson(settingsFile, next);
      return next;
    },
  };
}

async function mongoStore(uri) {
  const { default: mongoose } = await import('mongoose');
  await mongoose.connect(uri);

  const billSchema = () =>
    new mongoose.Schema(
      {
        month: { type: String, required: true, unique: true },
        amount: Number,
        opening: mongoose.Schema.Types.Mixed,
        closing: mongoose.Schema.Types.Mixed,
        result: mongoose.Schema.Types.Mixed,
        createdAt: Date,
      },
      { minimize: false },
    );
  const clean = ({ _id, __v, ...rest }) => rest;

  const repo = async (Model) => {
    await Model.init(); // make sure the unique index exists
    return {
      async list() {
        return (await Model.find().sort({ month: 1 }).lean()).map(clean);
      },
      async add(bill) {
        try {
          return clean((await Model.create(bill)).toObject());
        } catch (e) {
          throw e.code === 11000 ? duplicate() : e;
        }
      },
      async remove(month) {
        await Model.deleteOne({ month });
      },
      async clear() {
        await Model.deleteMany({});
      },
    };
  };

  const Settings = mongoose.model(
    'Setting',
    new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed }, { minimize: false }),
  );

  return {
    kind: 'mongo',
    repos: {
      real: await repo(mongoose.model('Bill', billSchema(), 'bills')),
      test: await repo(mongoose.model('TestBill', billSchema(), 'test_bills')),
    },
    getSettings: async () => (await Settings.findOne({ key: 'app' }).lean())?.value || {},
    async setSettings(patch) {
      const next = { ...((await Settings.findOne({ key: 'app' }).lean())?.value || {}), ...patch };
      await Settings.updateOne({ key: 'app' }, { value: next }, { upsert: true });
      return next;
    },
  };
}

export async function createStore() {
  const uri = process.env.MONGODB_URI?.trim();
  if (uri) {
    const s = await mongoStore(uri);
    console.log('✔ Connected to MongoDB');
    return s;
  }
  console.log('ℹ No MONGODB_URI set — using local file store (backend/data/)');
  return fileStore();
}
