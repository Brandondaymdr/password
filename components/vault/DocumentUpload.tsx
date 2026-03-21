'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { encryptFile, encryptFilename } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { logAuditEvent } from '@/lib/audit';
import { checkStorageLimit } from '@/lib/plan-enforcement';
import type { PlanType } from '@/types/vault';

interface DocumentUploadProps {
  linkedItemId?: string | null;
  onUploaded: () => void;
}

export default function DocumentUpload({ linkedItemId, onUploaded }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const vaultKey = VaultSession.get();
    if (!vaultKey) {
      setError('Vault is locked');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check plan storage limits before upload
      const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
      const { data: existingDocs } = await supabase.from('vault_documents').select('file_size').eq('user_id', user.id);
      const currentUsageMB = (existingDocs?.reduce((sum, d) => sum + (d.file_size || 0), 0) || 0) / (1024 * 1024);
      const totalNewFilesMB = Array.from(files).reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
      const plan: PlanType = (profile?.plan as PlanType) || 'personal';

      const limitCheck = checkStorageLimit(plan, currentUsageMB, totalNewFilesMB);
      if (!limitCheck.allowed) {
        setError(limitCheck.reason || 'Storage limit exceeded. Upgrade your plan for more storage.');
        setUploading(false);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Encrypting ${file.name}...`);

        // Encrypt the file client-side
        const { encryptedBuffer, fileKeyEncrypted, iv } = await encryptFile(file, vaultKey);

        // Encrypt the filename
        const encryptedName = await encryptFilename(file.name, vaultKey);

        // Upload encrypted blob to Supabase Storage
        const storagePath = `${user.id}/${crypto.randomUUID()}`;
        setProgress(`Uploading ${file.name}...`);

        const { error: uploadError } = await supabase.storage
          .from('vault-documents')
          .upload(storagePath, new Blob([encryptedBuffer]), {
            contentType: 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Save metadata to vault_documents table
        const { error: dbError } = await supabase.from('vault_documents').insert({
          user_id: user.id,
          linked_item_id: linkedItemId || null,
          storage_path: storagePath,
          file_name_encrypted: encryptedName.encrypted,
          file_name_iv: encryptedName.iv,
          file_key_encrypted: fileKeyEncrypted,
          file_iv: iv,
          file_size: file.size,
        });

        if (dbError) throw dbError;

        // Audit log
        await logAuditEvent('create');
      }

      setProgress('');
      onUploaded();

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
          {error}
        </div>
      )}

      <label
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-sm border-2 border-dashed px-6 py-8 transition-colors ${
          uploading
            ? 'border-[#1b4965]/15 bg-[#1b4965]/5'
            : 'border-[#1b4965]/15 hover:border-[#5fa8a0] hover:bg-[#5fa8a0]/5'
        }`}
      >
        {uploading ? (
          <>
            <svg className="h-8 w-8 animate-spin text-[#5fa8a0]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-[#1b4965]/60">{progress}</p>
          </>
        ) : (
          <>
            <svg className="h-8 w-8 text-[#1b4965]/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-[#1b4965]/60">
              <span className="text-[#5fa8a0]">Click to upload</span> or drag files here
            </p>
            <p className="text-xs text-[#1b4965]/40">Files are encrypted before upload</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
        />
      </label>
    </div>
  );
}
