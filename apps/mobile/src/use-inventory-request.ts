import { useLayoutEffect, useRef, useState } from 'react';
import { createInventoryApiClient, createInventoryPhotoApiClient, createInventoryPublicationApiClient, InventoryClientError } from '@pianotechpros/api-client';
import { useMobileSession } from './session-provider';

/** Mount within an account-keyed screen; only committed credentials are used. */
function useRequest<Client>(create:(baseURL:string,token:()=>string)=>Client) {
  const context = useMobileSession();
  const current = useRef<typeof context | null>(context);
  useLayoutEffect(() => { current.current = context; return () => { current.current = null; }; }, [context]);
  const [request] = useState(() => async <T,>(operation: (client: Client) => Promise<T>): Promise<T> => {
    const scope = current.current;
    const credential = scope?.session;
    if (!scope || !credential || Date.parse(credential.expiresAt) <= Date.now()) throw new InventoryClientError('unauthenticated', 401);
    try { return await operation(create(scope.apiURL, () => credential.token)); }
    catch (error) {
      if (error instanceof InventoryClientError && error.status === 401 && current.current?.session?.token === credential.token) current.current.reject(credential.token);
      throw error;
    }
  });
  return request;
}

export function useInventoryRequest(){return useRequest(createInventoryApiClient);}
export function useInventoryPhotoRequest(){return useRequest(createInventoryPhotoApiClient);}

export function useInventoryPublicationRequest(){return useRequest(createInventoryPublicationApiClient);}
