/**
 * Auditoria e revogação de acesso de dispositivos.
 *
 * Existe porque o registro automático concedia acesso ao workspace legado a
 * qualquer `X-Device-Id` — inclusive IDs de teste (`dbg*`, `qa-*`) e qualquer
 * valor que um estranho inventasse. O buraco foi fechado em `registerDevice`,
 * mas quem já entrou continua membro: é isto que revoga.
 *
 *   npm run devices -w backend -- list
 *   npm run devices -w backend -- revoke --match '^(dbg|qa-)'
 *   npm run devices -w backend -- revoke --match '^(dbg|qa-)' --apply
 *
 * Sem `--apply` só mostra o que faria. O administrador da instalação nunca é
 * removido: sem ele ninguém altera a configuração global.
 */
import '../src/config.js';
import { getRegistry } from '../src/registry/registryStore.js';
import { getServerAdminDeviceId } from '../src/serverAdmin.js';

const BOOTSTRAP_DEVICE_ID = 'bootstrap-system';

function parseArgs(argv: string[]) {
  const comando = argv[0];
  const ids: string[] = [];
  let match: string | null = null;
  let apply = false;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--id') ids.push(argv[(i += 1)]);
    else if (arg.startsWith('--id=')) ids.push(arg.slice('--id='.length));
    else if (arg === '--match') match = argv[(i += 1)];
    else if (arg.startsWith('--match=')) match = arg.slice('--match='.length);
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return { comando, ids, match, apply };
}

function listar(): void {
  const registry = getRegistry();
  const adminId = getServerAdminDeviceId();
  const devices = registry.listDevicesWithAccess();

  const comAcesso = devices.filter((d) => d.workspaceIds.length > 0);
  const semAcesso = devices.filter((d) => d.workspaceIds.length === 0);

  console.log(`${devices.length} dispositivos — ${comAcesso.length} com acesso\n`);
  for (const device of comAcesso) {
    const marcas = [
      device.id === adminId ? 'ADMIN' : null,
      device.id === BOOTSTRAP_DEVICE_ID ? 'BOOTSTRAP' : null,
    ].filter(Boolean);
    const sufixo = marcas.length > 0 ? `  [${marcas.join(' ')}]` : '';
    console.log(`  ${device.id}${sufixo}`);
    console.log(`      workspaces: ${device.workspaceIds.join(', ')}`);
    console.log(`      criado em:  ${device.createdAt}`);
  }

  if (semAcesso.length > 0) {
    console.log(`\n${semAcesso.length} sem acesso (aguardando convite):`);
    for (const device of semAcesso) {
      console.log(`  ${device.id}`);
    }
  }
}

function revogar(ids: string[], match: string | null, apply: boolean): void {
  if (ids.length === 0 && !match) {
    throw new Error('Informe --id <id> ou --match <regex>.');
  }

  const registry = getRegistry();
  const adminId = getServerAdminDeviceId();
  const regex = match ? new RegExp(match) : null;

  const alvos = registry
    .listDevicesWithAccess()
    .filter((d) => ids.includes(d.id) || (regex?.test(d.id) ?? false));

  const protegidos = alvos.filter(
    (d) => d.id === adminId || d.id === BOOTSTRAP_DEVICE_ID,
  );
  const removiveis = alvos.filter(
    (d) => d.id !== adminId && d.id !== BOOTSTRAP_DEVICE_ID,
  );

  for (const device of protegidos) {
    const motivo = device.id === adminId ? 'administrador' : 'bootstrap';
    console.log(`  preservado (${motivo}): ${device.id}`);
  }

  if (removiveis.length === 0) {
    console.log('Nenhum dispositivo a remover.');
    return;
  }

  for (const device of removiveis) {
    const acesso =
      device.workspaceIds.length > 0 ? device.workspaceIds.join(', ') : '(sem acesso)';
    console.log(`  ${apply ? 'removido' : 'removeria'}: ${device.id} — ${acesso}`);
    if (apply) {
      registry.deleteDevice(device.id);
    }
  }

  console.log(
    apply
      ? `\n${removiveis.length} dispositivos removidos.`
      : `\n${removiveis.length} dispositivos seriam removidos. Repita com --apply.`,
  );
}

const { comando, ids, match, apply } = parseArgs(process.argv.slice(2));

if (comando === 'list') {
  listar();
} else if (comando === 'revoke') {
  revogar(ids, match, apply);
} else {
  console.error('Uso: devices.ts <list|revoke> [--id <id>] [--match <regex>] [--apply]');
  process.exit(1);
}
