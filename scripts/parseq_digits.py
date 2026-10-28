"""PARSeq prepoznavanje ograničeno na znamenke. Uvoz: from parseq_digits import DigitReader"""
import os, torch, warnings, numpy as np, cv2
warnings.filterwarnings("ignore")

class DigitReader:
    def __init__(self, repo=None):
        repo = repo or os.environ.get("PARSEQ_REPO")          # lokalni klon (bez interneta) ili torch.hub
        if repo: self.m = torch.hub.load(repo, "parseq", pretrained=True, source="local").eval()
        else: self.m = torch.hub.load("baudm/parseq", "parseq", pretrained=True, trust_repo=True).eval()
        tok = self.m.tokenizer
        self.itos = tok._itos
        self.eos = tok.eos_id
        self.digit_ids = [i for i, c in enumerate(self.itos) if c in "0123456789"]
        mask = torch.full((len(self.itos),), float("-inf"))
        mask[self.digit_ids] = 0; mask[self.eos] = 0
        self.mask = mask[: self.m.hparams.num_tokens] if hasattr(self.m.hparams, "num_tokens") else mask
        H, W = self.m.hparams.img_size; self.H, self.W = H, W

    def _prep(self, bgr):
        canvas = cv2.resize(bgr, (self.W, self.H), interpolation=cv2.INTER_CUBIC)   # razvuci kao u treningu
        rgb = canvas[..., ::-1].astype(np.float32) / 255.0
        t = torch.from_numpy(rgb).permute(2, 0, 1)
        return (t - 0.5) / 0.5

    @torch.no_grad()
    def read(self, crops):
        """crops: lista BGR slika -> lista (tekst, conf)"""
        if not crops: return []
        x = torch.stack([self._prep(c) for c in crops])
        logits = self.m(x)                                       # [B, T, C]
        C = logits.shape[-1]
        logits = logits + self.mask[:C].to(logits)
        probs = logits.softmax(-1)
        out = []
        for p in probs:
            txt, conf = "", 1.0
            for step in p:
                i = int(step.argmax()); conf *= float(step[i])
                if i == self.eos: break
                txt += self.itos[i]
            out.append((txt, conf))
        return out

    @torch.no_grad()
    def score(self, crops, cands):
        """crops: lista BGR slika, cands: lista lista kandidata (npr. brojevi iz zapisnika)
        -> lista dict {kandidat: log-vjerojatnost} (+ pohlepno čitanje pod ključem '_greedy')"""
        if not crops: return []
        x = torch.stack([self._prep(c) for c in crops])
        logits = self.m(x); C = logits.shape[-1]
        logp = (logits + self.mask[:C].to(logits)).log_softmax(-1)
        stoi = {c: i for i, c in enumerate(self.itos)}
        out = []
        for lp, cl in zip(logp, cands):
            T = lp.shape[0]; res = {}
            for s in cl:
                if len(s) > T: continue
                v = sum(float(lp[i, stoi[ch]]) for i, ch in enumerate(s))
                if len(s) < T: v += float(lp[len(s), self.eos])
                res[s] = v
            out.append(res)
        return out
