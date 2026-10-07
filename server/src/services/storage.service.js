import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import env from '../config/env.js';
import { AppError } from '../utils/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const localDriver = (root) => {
  const resolve = (key) => {
    const target = path.resolve(root, key);
    if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid storage key');
    return target;
  };
  return {
    name: 'local',
    async put(key, body) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
    },
    async get(key) {
      try {
        return await fs.readFile(resolve(key));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    async remove(key) {
      await fs.rm(resolve(key), { force: true });
    },
  };
};

const s3Driver = () => {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });
  const Bucket = env.S3_BUCKET;
  return {
    name: 's3',
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (err) {
        if (err instanceof NoSuchKey || err.name === 'NoSuchKey') return null;
        throw err;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
};

const create = () => {
  if (env.storageDriver === 's3') return s3Driver();
  if (env.storageDriver === 'local') {
    return localDriver(env.isTest ? path.join(os.tmpdir(), 'scrs-test-storage') : path.join(here, '..', '..', 'storage'));
  }
  return null;
};

let driver = create();

export const useDriverForTests = (next) => { driver = next === undefined ? create() : next; };

export const isConfigured = () => driver !== null;
export const assertConfigured = () => active();
export const driverName = () => driver?.name ?? null;

const active = () => {
  if (!driver) {
    throw new AppError('Photo storage is not configured on this server yet. Please try again later.', 503, 'STORAGE_NOT_CONFIGURED');
  }
  return driver;
};

export const put = (key, body, contentType) => active().put(key, body, contentType);
export const get = (key) => active().get(key);
export const remove = (key) => active().remove(key);
