'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { decryptFilename, decryptFile } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { logAuditEvent } from '@/lib/audit';
import { useRouter } from 'next/navigation';
import DocumentUpload from '@/components/vault/DocumentUpload';
import type { VaultDocumentRow } from '@/types/vault';

interface DecryptedDocument {
  id: string;
  fileName: string;
  fileSize: number | null;
  storagePath: string;
  fileKeyEncrypted: string;
  fileIv: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DecryptedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [decryptionFailures, setDecryptionFailures] = useState(0);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDocuments() {
    const vaultKey = VaultSession.get();
    if (!vaultKey) {
      router.push('/dashboard');
      return;
    }

    setLoading(true);
    const { data: rows } = await supabase
      .from('vault_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (!rows) { setLoading(false); return; }

    const decrypted: DecryptedDocument[] = [];
    let failedCount = 0;
    for (const row of rows as VaultDocumentRow[]) {
      try {
        // Use the dedicated filename IV if available, fall back to file_iv for legacy docs
        const filenameIv = row.file_name_iv || row.file_iv;
        const fileName = await decryptFilename(row.file_name_encrypted, filenameIv, vaultKey);
        decrypted.push({
          id: row.id,
          fileName,
          fileSize: row.file_size,
          storagePath: row.storage_path,
          fileKeyEncrypted: row.file_key_encrypted,
          fileIv: row.file_iv,
          createdAt: row.created_at,
        });
      } catch { failedCount++; }
    }

    setDecryptionFailures(failedCount);
    setDocuments(decrypted);
    setLoading(false);
  }

  async function handleDownload(doc: DecryptedDocument) {
    const vaultKey = VaultSession.get();
    if (!vaultKey) return;

    setDownloading(doc.id);
    setError('');
    try {
      // Download encrypted blob from storage
      const { data: blob, error: dlError } = await supabase.storage
        .from('vault-documents')
        .download(doc.storagePath);

      if (dlError || !blob) throw dlError || new Error('Download failed');

      // Decrypt the file client-side
      const encryptedBuffer = await blob.arrayBuffer();
      const decryptedBuffer = await decryptFile(encryptedBuffer, doc.fileKeyEncrypted, doc.fileIv, vaultKey);

      // Trigger browser download
      const url = URL.createObjectURL(new Blob([decryptedBuffer]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Audit log
      await logAuditEvent('view', doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(docId: string, storagePath: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;

    await supabase.storage.from('vault-documents').remove([storagePath]);
    await supabase.from('vault_documents').delete().eq('id', docId);
    await logAuditEvent('delete', docId);
    await loadDocuments();
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-[#1b4965]/15 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="text-[#1b4965]/60 hover:text-[#1b4965]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-[#1b4965]">Documents</h1>
          </div>
          <span className="text-sm text-[#1b4965]/60">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Upload area */}
        <div className="mb-8">
          <DocumentUpload onUploaded={loadDocuments} />
        </div>

        {/* Download error */}
        {error && (
          <div className="mb-4 rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
            {error}
          </div>
        )}

        {/* Decryption failure warning */}
        {decryptionFailures > 0 && (
          <div className="mb-4 rounded-sm border border-[#d97706]/30 bg-[#d97706]/10 px-4 py-3 text-sm text-[#d97706]">
            {decryptionFailures} document{decryptionFailures > 1 ? 's' : ''} could not be decrypted and {decryptionFailures > 1 ? 'are' : 'is'} not shown. This may indicate data corruption.
          </div>
        )}

        {/* Document list */}
        {loading ? (
          <div className="py-12 text-center"><p className="animate-pulse text-[#1b4965]/60">Decrypting documents...</p></div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[#1b4965]/60">No documents yet. Upload a file above to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 rounded-sm border border-[#1b4965]/15 bg-white p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-[#1b4965]/10">
                  <svg className="h-5 w-5 text-[#5fa8a0]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[#1b4965]">{doc.fileName}</p>
                  <p className="text-xs text-[#1b4965]/60">
                    {formatFileSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  className="shrink-0 rounded-sm border border-[#1b4965]/15 px-3 py-1.5 text-sm text-[#1b4965]/70 transition-colors hover:bg-[#1b4965]/5 disabled:opacity-50"
                >
                  {downloading === doc.id ? 'Decrypting...' : 'Download'}
                </button>
                <button
                  onClick={() => handleDelete(doc.id, doc.storagePath)}
                  className="shrink-0 text-[#1b4965]/40 hover:text-[#e76f51]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
