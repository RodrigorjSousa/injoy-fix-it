-- Quarto 118 de Botafogo aparecia duas vezes: um cadastro antigo ("APT 118",
-- projeto Tuya 1, outro device_id) e o certo, do projeto 2
-- (eb6e92074066975bb3eggd). Desliga o antigo sem apagar, para a senha do 118
-- ir sempre para a fechadura certa, e padroniza o nome como os demais ("APT").
UPDATE public.tuya_devices
   SET ativo = false
 WHERE unidade = 'Botafogo'
   AND room_number = '118'
   AND device_id <> 'eb6e92074066975bb3eggd';

UPDATE public.tuya_devices
   SET label = 'APT 118', ativo = true, tuya_projeto = 2
 WHERE device_id = 'eb6e92074066975bb3eggd';
