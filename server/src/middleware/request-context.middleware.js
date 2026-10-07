import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const requestContext = (req, res, next) => storage.run({ req }, next);

export const currentRequest = () => storage.getStore()?.req;
