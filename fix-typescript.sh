#!/bin/bash
set -euo pipefail

# Quick fix for TypeScript issues

echo "Fixing TypeScript issues..."

cat > frontend/src/hooks/useWebSocket.ts << 'EOF'
import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const WS_URL = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'http://localhost:8000'

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    socketRef.current = io(WS_URL, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected')
      setConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setConnected(false)
    })

    socketRef.current.on('message', (data: any) => {
      console.log('WebSocket message:', data)
      setLastMessage(data)
    })

    socketRef.current.on('ami_event', (data: any) => {
      console.log('AMI event:', data)
      setLastMessage(data)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  return {
    connected,
    lastMessage,
    socket: socketRef.current,
  }
}
EOF

cat > frontend/src/services/api.ts << 'EOF'
const API_BASE_URL = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'http://localhost:8000'

class ApiService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  async getHealth() {
    return this.request<any>('/api/health')
  }

  async getDashboardStatus() {
    return this.request<any>('/api/dashboard/status')
  }

  async getActiveCalls() {
    return this.request<any>('/api/dashboard/active-calls')
  }

  async getRegisteredPeers() {
    return this.request<any>('/api/dashboard/registered-peers')
  }

  async getSipPeers() {
    return this.request<any[]>('/api/peers/')
  }

  async getSipPeer(id: number) {
    return this.request<any>(`/api/peers/${id}`)
  }

  async createSipPeer(data: any) {
    return this.request<any>('/api/peers/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSipPeer(id: number, data: any) {
    return this.request<any>(`/api/peers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteSipPeer(id: number) {
    return this.request<any>(`/api/peers/${id}`, {
      method: 'DELETE',
    })
  }

  async getCdr(limit: number = 50) {
    return this.request<any[]>(`/api/cdr/?limit=${limit}`)
  }

  async getCdrStats() {
    return this.request<any>('/api/cdr/stats')
  }
}

export const api = new ApiService(API_BASE_URL)
EOF

cat > frontend/src/vite-env.d.ts << 'EOF'
/// <reference types="vite/client" />
EOF

echo "TypeScript issues fixed."
echo "Run:"
echo "  docker compose build"
echo "  docker compose up -d"
