import { randomBytes,createHash } from 'node:crypto';
export const token=()=>randomBytes(32).toString('hex');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export function ensure(condition,message,status=400){if(!condition)throw new HttpError(status,message);}
export function text(value,max=5000){ensure(typeof value==='string'&&value.length<=max,'Campo de texto invalido.');return value.trim();}
export function integer(value,max=100000000){ensure(Number.isSafeInteger(value)&&value>=0&&value<=max,'Valor numerico invalido.');return value;}
