declare module 'firebase/app' {
  export interface FirebaseApp {
    name: string;
    options: Record<string, unknown>;
  }
  export function initializeApp(options: Record<string, unknown>, name?: string): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function getApp(name?: string): FirebaseApp;
}

declare module 'firebase/auth' {
  import type { FirebaseApp } from 'firebase/app';
  export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }
  export interface Auth {
    currentUser: User | null;
    signOut(): Promise<void>;
  }
  export interface UserCredential {
    user: User;
  }
  export interface OAuthCredential {
    accessToken?: string;
    idToken?: string;
  }
  export class GoogleAuthProvider {
    addScope(scope: string): GoogleAuthProvider;
    static credentialFromResult(result: UserCredential): OAuthCredential | null;
  }
  export function getAuth(app?: FirebaseApp): Auth;
  export function onAuthStateChanged(auth: Auth, nextOrObserver: (user: User | null) => void): () => void;
  export function signInWithPopup(auth: Auth, provider: GoogleAuthProvider): Promise<UserCredential>;
}
