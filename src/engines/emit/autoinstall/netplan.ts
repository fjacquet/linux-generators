import type { NetInterfaceSpec } from '../../model/installSpec'

// Netplan v2 `ethernets` map built from the abstract interface list.

export function buildEthernets(interfaces: NetInterfaceSpec[]): Record<string, unknown> {
  const ethernets: Record<string, unknown> = {}
  for (const iface of interfaces) {
    if (iface.mode === 'static') {
      const entry: Record<string, unknown> = { addresses: [`${iface.ip}/${iface.prefix}`] }
      if (iface.gateway) entry.routes = [{ to: 'default', via: iface.gateway }]
      if (iface.nameservers.length > 0) entry.nameservers = { addresses: iface.nameservers }
      ethernets[iface.device] = entry
    } else {
      ethernets[iface.device] = { dhcp4: true }
    }
  }
  return ethernets
}

/** Subiquity defaults to DHCP on all NICs, so we only emit a network section
 *  when there is something non-default to say (a static address or a named NIC). */
export function needsNetworkSection(interfaces: NetInterfaceSpec[]): boolean {
  return interfaces.some((iface) => iface.mode === 'static' || iface.device !== 'link')
}
