import { logger } from 'firebase-functions'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import {
  adjustCanteenStockSecure as adjustStock,
  chargeCanteenOrderSecure as chargeOrder,
  closeEmptyCanteenOrderSecure as closeEmptyOrder,
  confirmCanteenConsumptionSecure as confirmConsumption,
  createCanteenOrderSecure as createOrder,
  refundCanteenOrderSecure as refundOrder,
  requestCanteenVoidSecure as requestVoid,
  reviewCanteenVoidSecure as reviewVoid,
  setCanteenProductActiveSecure as setProductActive,
  upsertCanteenProductSecure as upsertProduct,
} from './canteen'
import { region } from './common'
import { registerEventPaymentSecure as registerEventPayment } from './events'
import {
  chargeVisitSecure as chargeVisit,
  checkoutVisitGroupSecure as checkoutGroup,
  createVisitSecure as createVisit,
  extendVisitTimeSecure as extendVisit,
  finishVisitSecure as finishVisit,
  registerPartialPaymentSecure as registerPartialPayment,
} from './visits'
import { resetOperationalTestDataSecure as resetOperationalData } from './adminReset'
import { getNativeBackupStatusSecure as getNativeBackupStatus } from './backups'
import { healthCheckEndpoint } from './health'

type SecureHandler = (uid: string | null | undefined, data: unknown) => Promise<unknown>

const callable = (name: string, handler: SecureHandler) => onCall(
  { region, timeoutSeconds: 60, memory: '256MiB', invoker: 'public' },
  async (request: CallableRequest<unknown>) => {
    try {
      return await handler(request.auth?.uid, request.data)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      logger.error(`[${name}] Error no controlado`, error)
      throw new HttpsError('internal', 'No se pudo completar la operacion segura.')
    }
  },
)

export const createCanteenOrderSecure = callable('createCanteenOrderSecure', createOrder)
export const confirmCanteenConsumption = callable('confirmCanteenConsumption', confirmConsumption)
export const chargeCanteenOrder = callable('chargeCanteenOrder', chargeOrder)
export const closeEmptyCanteenOrderSecure = callable('closeEmptyCanteenOrderSecure', closeEmptyOrder)
export const requestCanteenVoidSecure = callable('requestCanteenVoidSecure', requestVoid)
export const reviewCanteenVoidSecure = callable('reviewCanteenVoidSecure', reviewVoid)
export const refundCanteenOrderSecure = callable('refundCanteenOrderSecure', refundOrder)
export const upsertCanteenProductSecure = callable('upsertCanteenProductSecure', upsertProduct)
export const setCanteenProductActiveSecure = callable('setCanteenProductActiveSecure', setProductActive)
export const adjustCanteenStockSecure = callable('adjustCanteenStockSecure', adjustStock)

export const createVisitSecure = callable('createVisitSecure', createVisit)
export const checkoutVisitGroup = callable('checkoutVisitGroup', checkoutGroup)
export const chargeVisitSecure = callable('chargeVisitSecure', chargeVisit)
export const registerPartialPaymentSecure = callable('registerPartialPaymentSecure', registerPartialPayment)
export const extendVisitTimeSecure = callable('extendVisitTimeSecure', extendVisit)
export const finishVisitSecure = callable('finishVisitSecure', finishVisit)

export const registerEventPaymentSecure = callable('registerEventPaymentSecure', registerEventPayment)
export const resetOperationalTestData = callable('resetOperationalTestData', resetOperationalData)
export const getNativeBackupStatusSecure = callable('getNativeBackupStatusSecure', getNativeBackupStatus)
export const healthCheck = healthCheckEndpoint
