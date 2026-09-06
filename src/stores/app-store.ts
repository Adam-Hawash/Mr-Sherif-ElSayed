import { create } from 'zustand'

export type AppView =
  | 'landing'
  | 'auth-login'
  | 'auth-register'
  | 'student-pending'
  | 'student-portal'
  | 'admin-dashboard'
  | 'student-payment'

export interface Student {
  id: string
  name: string
  phone: string
  grade: string
  status: string
  isPaidAccess: boolean
  parentName: string
  parentPhone: string
  loginCount: number
  lastLogin: string | null
  watchedVideoCount?: number
  createdAt: string
  updatedAt: string
}

export interface ExamResult {
  id: string
  examId: string
  studentId: string
  score: number
  maxScore: number
  submittedAt: string
  student?: { name: string; phone: string; grade: string; status: string }
}

export interface GalleryImage {
  id: string
  title: string
  filePath: string
  type: string
  videoUrl: string
  sortOrder: number
  createdAt: string
}

export interface Admin {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Video {
  id: string
  title: string
  url: string
  filePath: string
  fileType: string
  thumbnail: string
  grade: string
  price: number
  createdAt: string
}

export interface Homework {
  id: string
  title: string
  content: string
  filePath: string
  fileType: string
  thumbnail: string
  grade: string
  createdAt: string
}

export interface Exam {
  id: string
  title: string
  content: string
  filePath: string
  fileType: string
  thumbnail: string
  grade: string
  createdAt: string
}

export interface Announcement {
  id: string
  title: string
  content: string
  grade: string
  createdAt: string
}

export interface Discussion {
  id: string
  studentId: string
  studentName: string
  grade: string
  content: string
  isAdminReply: boolean
  createdAt: string
}

export interface StudentActivity {
  id: string
  studentId: string
  action: string
  details: string
  createdAt: string
  student?: { name: string; grade: string; phone: string; status: string }
}

export const GRADES = [
  'الصف السادس الابتدائي',
  'أولى إعدادي',
  'تانية إعدادي',
  'تالتة إعدادي',
  'أولى بكالوريا',
] as const

export const GRADE_SHORT_NAMES: Record<string, string> = {
  'الصف السادس الابتدائي': 'G6',
  'أولى إعدادي': '1',
  'تانية إعدادي': '2',
  'تالتة إعدادي': '3',
  'أولى بكالوريا': '1B',
}

export const GRADES_EN = [
  { ar: 'الصف السادس الابتدائي', en: 'Grade 6', icon: 'G6' },
  { ar: 'أولى إعدادي', en: 'Prep 1', icon: '1' },
  { ar: 'تانية إعدادي', en: 'Prep 2', icon: '2' },
  { ar: 'تالتة إعدادي', en: 'Prep 3', icon: '3' },
  { ar: 'أولى بكالوريا', en: '1 Bac', icon: '1B' },
] as const

export interface Stats {
  totalStudents: number
  pendingStudents: number
  approvedStudents: number
  totalVideos: number
  totalHomework: number
  totalExams: number
  totalAnnouncements: number
  totalDiscussions: number
  grades: string[]
  pendingPayments?: number
}

export interface SiteConfig {
  [key: string]: string
}

export interface SocialLinks {
  social_facebook: string
  social_whatsapp_channel: string
  social_instagram: string
  social_youtube: string
}

interface AppState {
  currentView: AppView
  setView: (view: AppView) => void

  currentStudent: Student | null
  setCurrentStudent: (student: Student | null) => void
  currentAdmin: Admin | null
  setCurrentAdmin: (admin: Admin | null) => void
  isAdminLoggedIn: boolean
  setAdminLoggedIn: (v: boolean) => void

  showStudentLogin: boolean
  setShowStudentLogin: (v: boolean) => void
  showStudentRegister: boolean
  setShowStudentRegister: (v: boolean) => void
  showAdminLogin: boolean
  setShowAdminLogin: (v: boolean) => void

  adminTab: string
  setAdminTab: (tab: string) => void
  studentTab: string
  setStudentTab: (tab: string) => void

  siteConfig: SiteConfig
  setSiteConfig: (config: SiteConfig) => void
  configLoaded: boolean
  setConfigLoaded: (v: boolean) => void

  socialLinks: SocialLinks
  setSocialLinks: (links: SocialLinks) => void

  stats: Stats | null
  setStats: (stats: Stats | null) => void

  galleryImages: GalleryImage[]
  setGalleryImages: (images: GalleryImage[]) => void

  pendingPaymentVideo: { id: string; title: string; price: number; grade: string } | null
  setPendingPaymentVideo: (v: { id: string; title: string; price: number; grade: string } | null) => void

  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'landing',
  setView: (view) => set({ currentView: view }),

  currentStudent: null,
  setCurrentStudent: (student) => set({ currentStudent: student }),
  currentAdmin: null,
  setCurrentAdmin: (admin) => set({ currentAdmin: admin }),
  isAdminLoggedIn: false,
  setAdminLoggedIn: (v) => set({ isAdminLoggedIn: v }),

  showStudentLogin: false,
  setShowStudentLogin: (v) => set({ showStudentLogin: v }),
  showStudentRegister: false,
  setShowStudentRegister: (v) => set({ showStudentRegister: v }),
  showAdminLogin: false,
  setShowAdminLogin: (v) => set({ showAdminLogin: v }),

  adminTab: 'students',
  setAdminTab: (tab) => set({ adminTab: tab }),
  studentTab: 'videos',
  setStudentTab: (tab) => set({ studentTab: tab }),

  siteConfig: {},
  setSiteConfig: (config) => set({ siteConfig: config }),
  configLoaded: false,
  setConfigLoaded: (v) => set({ configLoaded: v }),

  socialLinks: {
    social_facebook: '',
    social_whatsapp_channel: '',
    social_instagram: '',
    social_youtube: '',
  },
  setSocialLinks: (links) => set({ socialLinks: links }),

  stats: null,
  setStats: (stats) => set({ stats }),

  galleryImages: [],
  setGalleryImages: (images) => set({ galleryImages: images }),

  pendingPaymentVideo: null,
  setPendingPaymentVideo: (v) => set({ pendingPaymentVideo: v }),

  logout: () =>
    set({
      currentStudent: null,
      currentAdmin: null,
      isAdminLoggedIn: false,
      currentView: 'landing',
      adminTab: 'students',
      studentTab: 'videos',
      showStudentLogin: false,
      showStudentRegister: false,
      showAdminLogin: false,
      pendingPaymentVideo: null,
    }),
}))
