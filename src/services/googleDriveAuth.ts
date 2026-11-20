import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { VaultRecord, WorkspaceSnapshot } from '../types/studio';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// Strictly in-memory token cache (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function initDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) {
        cachedAccessToken = null;
      }
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive access token was not returned by sign-in.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleDrive(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export async function listDriveWorkspaces(accessToken: string): Promise<VaultRecord[]> {
  const query = encodeURIComponent("name contains '.g2j.json' and trashed = false");
  const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=25`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive list failed (${res.status}). Sign in again if your session expired.`);
  }
  const data = (await res.json()) as {
    files?: Array<{ id: string; name: string; modifiedTime?: string; size?: string }>;
  };
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    updatedAt: f.modifiedTime || new Date().toISOString(),
    sizeBytes: Number.parseInt(f.size || '0', 10) || 0,
    source: 'drive',
  }));
}

export async function createDriveWorkspace(
  accessToken: string,
  fileName: string,
  snapshot: WorkspaceSnapshot
): Promise<VaultRecord> {
  const normalizedName = fileName.endsWith('.g2j.json') ? fileName : `${fileName}.g2j.json`;
  const boundary = 'grammar2json_studio_boundary';
  const metadata = JSON.stringify({
    name: normalizedName,
    mimeType: 'application/json',
  });
  const bodyContent = JSON.stringify(snapshot, null, 2);

  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    bodyContent,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to save workspace to Google Drive (${res.status}).`);
  }
  const created = (await res.json()) as { id: string; name: string; modifiedTime?: string; size?: string };
  return {
    id: created.id,
    name: created.name,
    updatedAt: created.modifiedTime || new Date().toISOString(),
    sizeBytes: Number.parseInt(created.size || String(bodyContent.length), 10),
    source: 'drive',
  };
}

export async function updateDriveWorkspace(
  accessToken: string,
  fileId: string,
  snapshot: WorkspaceSnapshot
): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot, null, 2),
  });
  if (!res.ok) {
    throw new Error(`Failed to update Google Drive file (${res.status}).`);
  }
}

export async function loadDriveWorkspace(
  accessToken: string,
  fileId: string
): Promise<WorkspaceSnapshot> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load Google Drive file (${res.status}).`);
  }
  return (await res.json()) as WorkspaceSnapshot;
}

export async function deleteDriveWorkspace(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete Google Drive file (${res.status}).`);
  }
}
