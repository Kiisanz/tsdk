import { createToken, type ServiceToken } from '@tsnx/hosting-abstractions';
import type { IMediator, ISender, IPublisher } from './types.js';

export const MEDIATOR: ServiceToken<IMediator> = createToken<IMediator>('IMediator');
export const SENDER: ServiceToken<ISender> = createToken<ISender>('ISender');
export const PUBLISHER: ServiceToken<IPublisher> = createToken<IPublisher>('IPublisher');
