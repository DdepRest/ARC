import unittest
import re
from silero_text_prep import normalize_text

class TestTTSNormalization(unittest.TestCase):
    def test_magnitudes(self):
        # 2,5 млрд человек -> два с половиной миллиарда человек
        res = normalize_text("2,5 млрд человек")
        self.assertIn("два с половиной миллиарда человек", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # 10 млн -> десять миллионов
        res = normalize_text("10 млн")
        self.assertIn("десять миллионов", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # 500 тыс. -> пятьсот тысяч
        res = normalize_text("500 тыс.")
        self.assertIn("пятьсот тысяч", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # более 500 тыс. часов
        res = normalize_text("более 500 тыс. часов")
        self.assertIn("более пятисот тысяч часов", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # 1,5 млн
        res = normalize_text("1,5 млн")
        self.assertIn("полтора миллиона", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

    def test_dates(self):
        # 14 февраля 2005 года -> четырнадцатого февраля две тысячи пятого года
        res = normalize_text("14 февраля 2005 года")
        self.assertIn("четырнадцатого февраля две тысячи пятого года", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # в 2026 году -> в две тысячи двадцать шестом году
        res = normalize_text("в 2026 году")
        self.assertIn("в две тысячи двадцать шестом году", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # 1 мая
        res = normalize_text("1 мая")
        self.assertIn("первого мая", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

        # 31 декабря 1999 года
        res = normalize_text("31 декабря 1999 года")
        self.assertIn("тридцать первого декабря тысяча девятьсот девяносто девятого года", res)
        self.assertFalse(re.search(r'\d', res), f"Found raw digits in: {res}")

    def test_youtube_paragraph(self):
        paragraph = (
            "YouTube был запущен 14 февраля 2005 года... "
            "аудитория превышает 2,5 млрд пользователей... "
            "загружается более 500 тыс. часов видео..."
        )
        res = normalize_text(paragraph)
        self.assertIn("ютуб был запущен четырнадцатого февраля две тысячи пятого года", res)
        self.assertIn("аудитория превышает два с половиной миллиарда пользователей", res)
        self.assertIn("загружается более пятисот тысяч часов видео", res)
        self.assertFalse(re.search(r'\d', res), f"Raw digits detected in YouTube paragraph: {res}")

    def test_homograph_zdorovo(self):
        # Verify здорово clean normalization without artificial accent marker
        res = normalize_text("Это здорово!")
        self.assertEqual("Это здорово!", res)

if __name__ == "__main__":
    unittest.main()
