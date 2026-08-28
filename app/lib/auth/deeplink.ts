import authService from './auth-service';
import { URL_SHARE_HOTSPOT360, URL_SHARE_MODEL3D, URL_SHARE_TOUR360 } from './config';
import { http, type AbpResponse } from './http';
import { discardPendingTab, redirectPendingTab } from './session';

// Ported from the reference app's `useResolveDeeplink` hook
// (src/hooks/use-resolve-deeplink.ts) and `deeplink-context.service.ts` /
// `projectV2.service.ts`: the project a logged-in account lands in is never
// a fixed URL — it's resolved per account, and a fresh Model3D project gets
// created the first time there isn't one yet.

export enum ProjectType {
  Hotspot360 = 1,
  Tour360 = 2,
  Model3D = 3,
}

type ResolveResult = {
  deeplink: string;
  hasActiveProject: boolean;
  lastEditedAt: string;
  menuPageId: number | null;
  projectId: number;
  projectName: string;
  spaceId: number | null;
  projectType: ProjectType | null;
};

function baseShareUrl(type: ProjectType): string {
  switch (type) {
    case ProjectType.Hotspot360:
      return URL_SHARE_HOTSPOT360;
    case ProjectType.Tour360:
      return URL_SHARE_TOUR360;
    case ProjectType.Model3D:
      return URL_SHARE_MODEL3D;
    default:
      return URL_SHARE_HOTSPOT360;
  }
}

// Same field the reference app's `resolve()` reads off this envelope: `.data`.
async function resolveDeeplinkContext(): Promise<ResolveResult | undefined> {
  const response = await http.request<AbpResponse<ResolveResult>>({
    url: '/studio/api/services/app/DeeplinkContext/Resolve',
    method: 'post',
  });
  return response.data.data;
}

async function createModel3DProject(): Promise<{ id: number }> {
  const response = await http.request<AbpResponse<{ id: number }>>({
    url: '/studio/api/services/app/projectV2/Create',
    method: 'post',
    data: {
      versionVR: '2',
      name: '',
      isCheckin: false,
      iconUrl: '',
      projectType: ProjectType.Model3D,
      isPublic: 0, // isPublicProject.Creating
    },
  });
  if (!response.data.data) throw new Error('Không tạo được project mới');
  return response.data.data;
}

async function buildDeeplinkUrl(accountId: number | string): Promise<string | null> {
  const res = await resolveDeeplinkContext();
  if (!res) return null;

  switch (res.projectType) {
    case ProjectType.Hotspot360:
    case ProjectType.Model3D:
      return `${baseShareUrl(res.projectType)}/admin/project/${res.projectId}/${accountId}`;
    case ProjectType.Tour360:
      return `${baseShareUrl(res.projectType)}/editor/${res.projectId}`;
    default: {
      const project = await createModel3DProject();
      return `${baseShareUrl(ProjectType.Model3D)}/admin/project/${project.id}/${accountId}`;
    }
  }
}

/**
 * Resolves the account's project and opens it in a new tab — redirecting
 * whatever tab `openBlankTab()` opened at the triggering click, or opening a
 * fresh one directly if none is pending. Only a plain email/password login
 * calls this; social login just goes home, same as the reference app.
 */
export async function openDeeplinkProject(): Promise<void> {
  try {
    const account = await authService.getUserDetailRequest();
    const url = await buildDeeplinkUrl(account.id);
    if (!url) {
      discardPendingTab();
      return;
    }
    if (!redirectPendingTab(url)) window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    discardPendingTab();
    console.error('[deeplink] failed to resolve project', error);
  }
}
