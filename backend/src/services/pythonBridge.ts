import { spawn } from 'child_process';
import * as path from 'path';

export async function runPythonScript(
  scriptName: string,
  args: string[]
): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'python', scriptName);
    console.log(`Running Python script: ${scriptPath}`);
    console.log(`Arguments: ${args.join(' ')}`);

    const pythonProcess = spawn('python3', [scriptPath, ...args]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Python stdout: ${output}`);
      stdout += output;
    });

    pythonProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`Python stderr: ${output}`);
      stderr += output;
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        reject(
          new Error(`Python script exited with code ${code}\nstderr: ${stderr}`)
        );
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          resolve(stdout);
        }
      }
    });
  });
}
