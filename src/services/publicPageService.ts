import { Timestamp, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { appConfig } from '../config/app'
import { storage } from '../config/firebase'
import { getCollectionRef } from './firestoreCollections'

export interface PublicInstallationItem {
  accent: string
  id: string
  imageUrl: string
  isActive: boolean
  title: string
}

export interface PublicBirthdayPackage {
  buttonText: string
  description: string
  features: string[]
  id: string
  isActive: boolean
  name: string
  priceText: string
  secondaryText: string
  summary: string
}

export interface PublicPageConfig {
  birthday: {
    description: string
    packages: PublicBirthdayPackage[]
    title: string
  }
  contact: {
    description: string
    title: string
    whatsappMessage: string
    whatsappNumber: string
  }
  home: {
    description: string
    eyebrow: string
    heroImageUrl: string
    title: string
  }
  installations: {
    description: string
    items: PublicInstallationItem[]
    title: string
  }
  updatedAt?: Date | null
}

export const publicPageConfigDefaults: PublicPageConfig = {
  birthday: {
    description: 'Paquetes listos para celebrar con una experiencia segura, alegre y profesional.',
    packages: [
      {
        buttonText: 'Consultar',
        description: '2 horas de salón privado',
        features: ['Acceso a juegos', 'Anfitrión de apoyo', 'Mesa principal preparada'],
        id: 'basico',
        isActive: true,
        name: 'Básico',
        priceText: 'Consultar',
        secondaryText: 'Ideal para grupos pequeños',
        summary: 'Diversión asegurada',
      },
      {
        buttonText: 'Consultar',
        description: '3 horas de salón privado',
        features: ['Acceso a juegos', 'Control de invitados', 'Soporte de recepción'],
        id: 'estandar',
        isActive: true,
        name: 'Estándar',
        priceText: 'Consultar',
        secondaryText: 'La opción más elegida',
        summary: 'Cumple completo',
      },
      {
        buttonText: 'Consultar',
        description: '4 horas de salón privado',
        features: ['Acceso a juegos', 'Banner para TV', 'Configuración visual especial'],
        id: 'premium',
        isActive: true,
        name: 'Premium',
        priceText: 'Consultar',
        secondaryText: 'Pensado para eventos grandes',
        summary: 'Experiencia completa',
      },
    ],
    title: 'Paquetes listos para celebrar',
  },
  contact: {
    description: 'Dejá preparada la conversación por WhatsApp y coordinamos la disponibilidad.',
    title: 'Consultá disponibilidad para tu cumple',
    whatsappMessage: 'Hola Lucca Park, quiero consultar disponibilidad para un cumple.',
    whatsappNumber: appConfig.whatsappNumber,
  },
  home: {
    description: 'Un parque infantil diseñado para jugar, celebrar y crear recuerdos inolvidables con una experiencia segura, alegre y profesional.',
    eyebrow: 'Parque infantil y eventos',
    heroImageUrl: appConfig.heroImageUrl,
    title: 'El lugar donde la diversión cobra vida',
  },
  installations: {
    description: 'Juegos, salones y zonas preparadas para recibir visitas normales y eventos privados.',
    items: [
      { accent: 'orange', id: 'juegos', imageUrl: '', isActive: true, title: 'Juegos interactivos' },
      { accent: 'green', id: 'toboganes', imageUrl: '', isActive: true, title: 'Toboganes' },
      { accent: 'turquoise', id: 'salones', imageUrl: '', isActive: true, title: 'Salones privados' },
      { accent: 'yellow', id: 'zona', imageUrl: '', isActive: true, title: 'Zona de juegos' },
    ],
    title: 'Espacios pensados para cada aventura',
  },
  updatedAt: null,
}

const configDocRef = () => doc(getCollectionRef('landingContent'), 'publicPage')

const dateFromTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

const stringValue = (value: unknown, fallback: string) => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const mergePublicPageConfig = (data: Record<string, unknown> | undefined): PublicPageConfig => {
  const home = (data?.home ?? {}) as Partial<PublicPageConfig['home']>
  const installations = (data?.installations ?? {}) as Partial<PublicPageConfig['installations']>
  const birthday = (data?.birthday ?? {}) as Partial<PublicPageConfig['birthday']>
  const contact = (data?.contact ?? {}) as Partial<PublicPageConfig['contact']>

  return {
    birthday: {
      description: stringValue(birthday.description, publicPageConfigDefaults.birthday.description),
      packages: Array.isArray(birthday.packages) ? birthday.packages as PublicBirthdayPackage[] : publicPageConfigDefaults.birthday.packages,
      title: stringValue(birthday.title, publicPageConfigDefaults.birthday.title),
    },
    contact: {
      description: stringValue(contact.description, publicPageConfigDefaults.contact.description),
      title: stringValue(contact.title, publicPageConfigDefaults.contact.title),
      whatsappMessage: stringValue(contact.whatsappMessage, publicPageConfigDefaults.contact.whatsappMessage),
      whatsappNumber: stringValue(contact.whatsappNumber, publicPageConfigDefaults.contact.whatsappNumber),
    },
    home: {
      description: stringValue(home.description, publicPageConfigDefaults.home.description),
      eyebrow: stringValue(home.eyebrow, publicPageConfigDefaults.home.eyebrow),
      heroImageUrl: stringValue(home.heroImageUrl, publicPageConfigDefaults.home.heroImageUrl),
      title: stringValue(home.title, publicPageConfigDefaults.home.title),
    },
    installations: {
      description: stringValue(installations.description, publicPageConfigDefaults.installations.description),
      items: Array.isArray(installations.items) ? installations.items as PublicInstallationItem[] : publicPageConfigDefaults.installations.items,
      title: stringValue(installations.title, publicPageConfigDefaults.installations.title),
    },
    updatedAt: dateFromTimestamp(data?.updatedAt),
  }
}

export const subscribePublicPageConfig = (
  onNext: (config: PublicPageConfig) => void,
  onError?: (message: string) => void,
) =>
  onSnapshot(
    configDocRef(),
    (snapshot) => onNext(mergePublicPageConfig(snapshot.exists() ? snapshot.data() : undefined)),
    (error) => onError?.(error.message),
  )

export const getPublicPageConfig = async () => {
  const snapshot = await getDoc(configDocRef())
  return mergePublicPageConfig(snapshot.exists() ? snapshot.data() : undefined)
}

export const savePublicPageConfig = async (config: PublicPageConfig) => {
  await setDoc(configDocRef(), { ...config, updatedAt: serverTimestamp() }, { merge: true })
}

export const uploadPublicPageImage = async (file: File, folder: 'hero' | 'installations', itemId = 'main') => {
  const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg'
  const safeItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const imageRef = ref(storage, `public-page-images/${folder}/${safeItemId}-${Date.now()}.${extension}`)
  await uploadBytes(imageRef, file, { contentType: file.type })
  return getDownloadURL(imageRef)
}
