"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { COLORS } from "@/lib/theme";
import * as productApi from "@/lib/api/product";

interface ProductImageUploadProps {
  existingPreviewUrl?: string;
  onUploaded: (key: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

export function ProductImageUpload({
  existingPreviewUrl,
  onUploaded,
  onUploadingChange,
}: ProductImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState(existingPreviewUrl ?? "");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectUrlRef.current) setPreviewUrl(existingPreviewUrl ?? "");
  }, [existingPreviewUrl]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { uploadUrl, key } = await productApi.issueImageUploadUrl(file.type);
      await productApi.uploadToPresignedUrl(uploadUrl, file);
      return key;
    },
    onMutate: () => onUploadingChange?.(true),
    onSuccess: (key) => onUploaded(key),
    onSettled: () => onUploadingChange?.(false),
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    uploadMutation.mutate(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs" style={{ color: COLORS.muted }}>
        상품 이미지
      </label>
      {previewUrl && (
        // 업로드 전 blob URL과 환경변수 기반 외부 URL을 함께 다뤄야 하므로 일반 img를 쓴다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="상품 이미지 미리보기"
          className="w-full h-44 rounded-lg object-cover"
          style={{ border: `1px solid ${COLORS.border}` }}
        />
      )}
      <input
        required={!existingPreviewUrl}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploadMutation.isPending}
        className="w-full px-4 py-3 rounded-lg text-sm disabled:opacity-60"
        style={{ background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
      />
      {uploadMutation.isPending && (
        <p className="text-xs" style={{ color: COLORS.accent }}>
          이미지 업로드 중...
        </p>
      )}
      {uploadMutation.isSuccess && (
        <p className="text-xs" style={{ color: COLORS.green }}>
          이미지 업로드가 완료되었습니다.
        </p>
      )}
      {uploadMutation.isError && (
        <p className="text-xs" style={{ color: "#E0554F" }}>
          {uploadMutation.error instanceof Error
            ? uploadMutation.error.message
            : "이미지 업로드에 실패했습니다."}
        </p>
      )}
    </div>
  );
}
