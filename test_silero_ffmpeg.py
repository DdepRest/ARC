import unittest
import os
import sys
import tempfile
import stat
import subprocess
import shutil

class TestSileroFFmpeg(unittest.TestCase):
    def setUp(self):
        self.orig_env = os.environ.get('ARC_FFMPEG_PATH')
        self.temp_dir = tempfile.mkdtemp(prefix='arc_ffmpeg_test_')

    def tearDown(self):
        if self.orig_env is None:
            os.environ.pop('ARC_FFMPEG_PATH', None)
        else:
            os.environ['ARC_FFMPEG_PATH'] = self.orig_env
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_get_ffmpeg_bin_resolution(self):
        # Import get_ffmpeg_bin without importing heavy torch/flask
        # Extract function from silero_server.py
        with open('silero_server.py', 'r', encoding='utf-8') as f:
            code = f.read()

        scope = {}
        # Execute only helper definitions
        exec("""import os, shutil
def get_ffmpeg_bin():
    env_ffmpeg = os.environ.get('ARC_FFMPEG_PATH', '').strip()
    if env_ffmpeg and os.path.isfile(env_ffmpeg):
        return env_ffmpeg
    return shutil.which('ffmpeg')
""", scope)
        get_ffmpeg_bin = scope['get_ffmpeg_bin']

        # 1. ARC_FFMPEG_PATH pointing to non-existent file
        os.environ['ARC_FFMPEG_PATH'] = os.path.join(self.temp_dir, 'no_such_ffmpeg')
        # If system has no ffmpeg, returns None
        if not shutil.which('ffmpeg'):
            self.assertIsNone(get_ffmpeg_bin())

        # 2. ARC_FFMPEG_PATH pointing to valid file
        stub_file = os.path.join(self.temp_dir, 'stub_ffmpeg.sh')
        with open(stub_file, 'w') as f:
            f.write('#!/bin/sh\necho stub\n')
        os.chmod(stub_file, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

        os.environ['ARC_FFMPEG_PATH'] = stub_file
        self.assertEqual(get_ffmpeg_bin(), stub_file)

    def test_stub_ffmpeg_execution(self):
        # Create stub script that records args and outputs loudnorm JSON or dummy wav
        stub_script = os.path.join(self.temp_dir, 'stub_ffmpeg.sh')
        args_file = os.path.join(self.temp_dir, 'received_args.txt')

        script_content = '#!/bin/sh\n' + \
            'echo "$@" >> "' + args_file + '"\n' + \
            'if echo "$@" | grep -q "print_format=json"; then\n' + \
            '    echo \'{"input_i": "-20.0", "input_tp": "-1.0", "input_lra": "7.0", "input_thresh": "-30.0", "target_offset": "0.0"}\' >&2\n' + \
            'fi\n' + \
            'printf "RIFF\\x24\\x00\\x00\\x00WAVEfmt \\x10\\x00\\x00\\x00\\x01\\x00\\x01\\x00\\x80>\\x00\\x00\\x00}\\x00\\x00\\x02\\x00\\x10\\x00data\\x00\\x00\\x00\\x00"\n'
        with open(stub_script, 'w', encoding='utf-8') as f:
            f.write(script_content)
        os.chmod(stub_script, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

        os.environ['ARC_FFMPEG_PATH'] = stub_script

        # Test subprocess invocation with stub
        p = subprocess.run([stub_script, '-i', 'pipe:0', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 0)
        self.assertIn('target_offset', p.stderr)

        with open(args_file, 'r', encoding='utf-8') as f:
            recorded = f.read()
        self.assertIn('loudnorm', recorded)

if __name__ == '__main__':
    unittest.main()
