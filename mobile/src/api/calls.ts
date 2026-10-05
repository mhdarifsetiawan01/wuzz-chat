/**
 * WuzzChat Calls API: daftar STUN/TURN untuk panggilan suara (kredensial TURN sementara dari backend).
 */

import { apiClient } from './client';

export interface RtcIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  ice_servers: RtcIceServer[];
  ttl: number;
}

export const callsApi = {
  /**
   * GET /api/calls/ice-servers
   * Kredensial TURN berlaku singkat (ttl detik), jadi diminta setiap kali panggilan dimulai/dijawab.
   */
  async getIceServers(timeoutMs = 4000): Promise<IceServersResponse> {
    return apiClient<IceServersResponse>('/api/calls/ice-servers', { method: 'GET', timeoutMs });
  },
};
