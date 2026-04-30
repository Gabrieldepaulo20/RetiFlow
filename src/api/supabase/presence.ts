import { callRPC } from './_base';

export async function touchUserPresence(currentRoute?: string) {
  await callRPC('touch_usuario_presenca', {
    p_current_route: currentRoute?.slice(0, 160) ?? null,
  });
}
