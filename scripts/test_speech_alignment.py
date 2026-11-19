import unittest
from types import SimpleNamespace
from analyze_speech import alignment_chunks, preprocess_waveform, valid_alignment

class AlignmentGuards(unittest.TestCase):
    def test_short_and_context(self):
        words=[{'word':'א','start':1,'end':2}]
        group,segment=next(alignment_chunks(words,3))
        self.assertEqual(group,words)
        self.assertEqual(segment,{'start':1,'end':2,'text':'א'})

    def test_long_passage_bounded_without_dropped_or_reordered_tokens(self):
        words=[{'word':str(i),'start':i*.6,'end':(i+1)*.6} for i in range(30)]
        groups=list(alignment_chunks(words,18))
        self.assertEqual([w for group,_ in groups for w in group],words)
        self.assertGreater(len(groups),1)
        for _,seg in groups:
            self.assertIsNotNone(seg)
            self.assertLessEqual(seg['end']-seg['start'],5)
            self.assertGreaterEqual(seg['start'],0)
            self.assertLessEqual(seg['end'],18)

    def test_gap_splits_and_oversized_token_has_no_alignment(self):
        words=[{'word':'a','start':0,'end':.5},{'word':'b','start':3,'end':4}]
        self.assertEqual(len(list(alignment_chunks(words,5))),2)
        self.assertIsNone(next(alignment_chunks([{'word':'long','start':0,'end':20}],20))[1])
        self.assertEqual(list(alignment_chunks([],10)),[])

    def test_bounds_score_and_finiteness_remain_strict(self):
        self.assertTrue(valid_alignment({'start':0,'end':3.24,'score':.1},3.24))
        for c in [{'start':0,'end':3.26,'score':.9},
                  {'start':0,'end':1,'score':.09},
                  {'start':float('nan'),'end':1,'score':1},
                  {'start':1,'end':1,'score':1},
                  {'start':-1,'end':1,'score':1},{}]:
            self.assertFalse(valid_alignment(c,3.24))

    def test_chunk_edge_overrun_is_not_clamped_or_accepted(self):
        self.assertFalse(valid_alignment({'start':1,'end':4.52,'score':.9},12,
                                         {'start':0,'end':4.5}))
        self.assertFalse(valid_alignment({'start':2.9,'end':4,'score':.9},12,
                                         {'start':3,'end':7}))

    def test_preprocessor_contract_and_device(self):
        calls=[]
        class Tensor:
            device='cpu'
            def cpu(self): return self
            def numpy(self): return 'wave'
            def to(self,device): calls.append(device);return self
        wave=Tensor()
        def extractor(values,**kwargs):
            calls.append((values,kwargs));return SimpleNamespace(input_values=wave)
        self.assertIs(preprocess_waveform(wave,extractor),wave)
        self.assertEqual(calls,[('wave',{'sampling_rate':16000,'return_tensors':'pt'}),'cpu'])



import unittest,json,random
from pathlib import Path
from analyze_speech import alignment_chunks,ordered_intervals,interpolate_unaligned,valid_alignment
class DisjointWindowTests(unittest.TestCase):
 def seeds(self,n=25):return [{'word':str(i),'start':i*.4,'end':(i+1)*.4} for i in range(n)]
 def test_windows_disjoint_and_bounded_preserve_every_token(self):
  words=self.seeds();groups=list(alignment_chunks(words,10));self.assertEqual([w for g,_ in groups for w in g],words)
  for i,(_,s) in enumerate(groups):
   self.assertLessEqual(s['end']-s['start'],5)
   if i:self.assertLessEqual(groups[i-1][1]['end'],s['start'])
 def test_oversized_preserved_unaligned_and_gaps_split(self):
  w=[{'word':'a','start':0,'end':.5},{'word':'b','start':3,'end':9}];g=list(alignment_chunks(w,10))
  self.assertEqual(len(g),2);self.assertIsNone(g[1][1]);self.assertEqual(g[1][0],[w[1]])
 def test_invalid_seeds_fail_before_model(self):
  for w in [[{'word':'a','start':0,'end':0}],[{'word':'a','start':float('nan'),'end':2}],[{'word':'a','start':0,'end':2},{'word':'b','start':1,'end':3}]]:
   with self.assertRaises(ValueError):list(alignment_chunks(w,4))
 def test_fallback_moves_into_gap_without_moving_anchors(self):
  g=self.seeds(4);c=[dict(w,aligned=False) for w in g];c[0].update(start=.1,end=.8,aligned=True);c[3].update(start=1.2,end=1.5,aligned=True)
  r=interpolate_unaligned(c,g,{'start':0,'end':1.6},1.6)
  self.assertEqual(r[0],c[0]);self.assertEqual(r[3],c[3]);self.assertTrue(ordered_intervals(r,1.6));self.assertEqual(r[1]['start'],.8);self.assertEqual(r[2]['end'],1.2);self.assertFalse(r[1]['aligned'])
 def test_no_anchor_all_estimated_not_false_success(self):
  g=self.seeds(4);c=[dict(w,aligned=False) for w in g];r=interpolate_unaligned(c,g,{'start':0,'end':1.6},1.6)
  self.assertTrue(ordered_intervals(r,1.6));self.assertFalse(any(w['aligned'] for w in r))
 def test_conflicting_anchors_not_silently_clamped_or_dropped(self):
  g=self.seeds(2);c=[dict(w,aligned=True) for w in g];c[0]['end']=.6;c[1]['start']=.5
  with self.assertRaises(ValueError):interpolate_unaligned(c,g,{'start':0,'end':.8},.8)
 def test_no_room_for_estimate_fails_explicitly(self):
  g=self.seeds(3);c=[dict(w,aligned=True) for w in g];c[1]['aligned']=False;c[0]['end']=.6;c[2]['start']=.6
  with self.assertRaises(ValueError):interpolate_unaligned(c,g,{'start':0,'end':1.2},1.2)
 def test_input_unmodified(self):
  g=self.seeds(3);c=[dict(w,aligned=False) for w in g];before=json.dumps(c);interpolate_unaligned(c,g,{'start':0,'end':1.2},1.2);self.assertEqual(json.dumps(c),before)
 def test_random_ordered_anchors_never_moved(self):
  rng=random.Random(20261118)
  for _ in range(1000):
   g=self.seeds(25);c=[dict(w,start=w['start']+.02,end=w['end']-.02,aligned=rng.random()<.6) for w in g]
   r=interpolate_unaligned(c,g,{'start':0,'end':10},10);self.assertTrue(ordered_intervals(r,10))
   for a,b in zip(c,r):
    if a['aligned']:self.assertEqual(a,b)
 def test_strict_threshold_not_lowered(self):
  self.assertFalse(valid_alignment({'start':0,'end':1,'score':.099},2));self.assertFalse(valid_alignment({'start':0,'end':2.01,'score':.9},2))


if __name__ == "__main__": unittest.main()
