#!/usr/bin/env python3
"""
Mem0 Sync Daemon for Qdrant
Continuously polls Mem0 and syncs all users to Qdrant
This is the CORRECT implementation that runs automatically
"""
import os
import time
import asyncio
import requests
from typing import List, Dict, Set
from dotenv import load_dotenv

load_dotenv()

MEM0_API_KEY = os.getenv('MEM0_API_KEY')
MEM0_API_URL = 'https://api.mem0.ai/v1'
QDRANT_URL = os.getenv('QDRANT_URL', 'http://localhost:8765')
SYNC_INTERVAL = int(os.getenv('SYNC_INTERVAL_SECONDS', '60'))  # Default: every 60 seconds

class Mem0SyncDaemon:
    def __init__(self):
        self.synced_users: Set[str] = set()
        self.last_sync_time: Dict[str, float] = {}
        
    def get_all_mem0_users(self) -> List[str]:
        """
        Get all unique user IDs from Mem0
        Since Mem0 API requires a filter, we'll try common user IDs
        In production, you'd maintain a list of known users
        """
        # For now, we'll use the known users: Matt, Noa, John
        # TODO: Implement proper user discovery if Mem0 API supports it
        return ['Matt', 'Noa', 'John']
    
    def get_mem0_memories(self, user_id: str) -> List[Dict]:
        """Fetch all memories for a user from Mem0"""
        try:
            response = requests.get(
                f'{MEM0_API_URL}/memories/?user_id={user_id}',
                headers={'Authorization': f'Token {MEM0_API_KEY}'}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"[Sync] Error fetching memories for {user_id}: {e}")
            return []
    
    def add_to_qdrant(self, user_id: str, text: str, topic: str = 'general'):
        """Add a memory to Qdrant"""
        try:
            response = requests.post(
                f'{QDRANT_URL}/add_memory',
                json={
                    'user_id': user_id,
                    'text': text,
                    'topic': topic,
                    'type': 'stable'
                }
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"[Sync] Error adding to Qdrant: {e}")
            return False
    
    def infer_topic(self, text: str) -> str:
        """Infer topic from memory text"""
        lower = text.lower()
        if any(word in lower for word in ['food', 'restaurant', 'cuisine', 'meal', 'eat', 'allergy']):
            return 'food'
        if any(word in lower for word in ['movie', 'film', 'cinema']):
            return 'movies'
        if any(word in lower for word in ['music', 'song', 'artist']):
            return 'music'
        return 'general'
    
    def sync_user(self, user_id: str) -> Dict[str, int]:
        """Sync all memories for a user from Mem0 to Qdrant"""
        print(f"[Sync] Syncing {user_id}...")
        
        # Get memories from Mem0
        mem0_memories = self.get_mem0_memories(user_id)
        
        if not mem0_memories:
            print(f"[Sync] No memories found for {user_id}")
            return {'synced': 0, 'errors': 0}
        
        synced = 0
        errors = 0
        
        # Add each memory to Qdrant
        for memory in mem0_memories:
            memory_text = memory.get('memory', '')
            if not memory_text:
                continue
                
            topic = self.infer_topic(memory_text)
            
            if self.add_to_qdrant(user_id, memory_text, topic):
                synced += 1
            else:
                errors += 1
        
        print(f"[Sync] {user_id}: {synced} synced, {errors} errors")
        return {'synced': synced, 'errors': errors}
    
    def run_sync_cycle(self):
        """Run one complete sync cycle for all users"""
        print(f"\n[Sync] ===== Starting sync cycle at {time.strftime('%Y-%m-%d %H:%M:%S')} =====")
        
        users = self.get_all_mem0_users()
        print(f"[Sync] Found {len(users)} users to sync")
        
        total_synced = 0
        total_errors = 0
        
        for user_id in users:
            result = self.sync_user(user_id)
            total_synced += result['synced']
            total_errors += result['errors']
            self.last_sync_time[user_id] = time.time()
        
        print(f"[Sync] ===== Cycle complete: {total_synced} total synced, {total_errors} total errors =====\n")
    
    def run_forever(self):
        """Run the sync daemon continuously"""
        print(f"[Sync Daemon] Starting Mem0 → Qdrant sync daemon")
        print(f"[Sync Daemon] Mem0 API: {MEM0_API_URL}")
        print(f"[Sync Daemon] Qdrant URL: {QDRANT_URL}")
        print(f"[Sync Daemon] Sync interval: {SYNC_INTERVAL} seconds")
        print(f"[Sync Daemon] Press Ctrl+C to stop\n")
        
        try:
            while True:
                try:
                    self.run_sync_cycle()
                except Exception as e:
                    print(f"[Sync] Error in sync cycle: {e}")
                
                # Wait for next cycle
                print(f"[Sync] Sleeping for {SYNC_INTERVAL} seconds...")
                time.sleep(SYNC_INTERVAL)
                
        except KeyboardInterrupt:
            print("\n[Sync Daemon] Shutting down gracefully...")

if __name__ == '__main__':
    if not MEM0_API_KEY:
        print("ERROR: MEM0_API_KEY not set in environment")
        exit(1)
    
    daemon = Mem0SyncDaemon()
    daemon.run_forever()
