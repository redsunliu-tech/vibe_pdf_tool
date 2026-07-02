import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface ZipFile {
  blob: Blob;
  filename: string;
}

export async function downloadAsZip(
  files: ZipFile[],
  zipName: string = 'download'
): Promise<void> {
  const zip = new JSZip();
  
  // Add each file to the ZIP
  files.forEach(({ blob, filename }) => {
    zip.file(filename, blob);
  });
  
  // Generate and download the ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${zipName}.zip`);
}